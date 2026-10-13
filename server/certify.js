// Free certificates for the server (generated/world_server_plan.md §9.2): got from Let's Encrypt
// by ACME (net/acme.js) by one of three routes, kept and renewed by the server itself.
//
//   duckdns  a free name (name.duckdns.org), proved by DNS-01 through DuckDNS's API with the
//            owner's token; the name kept pointed at the home's address (every 5 minutes)
//   dns      the owner's own domain, proved by DNS-01 through its DNS host's API (Cloudflare or
//            deSEC: net/dns-hosts.js) with a token the owner pastes in
//   ip       the home's public address, proved by TLS-ALPN-01 on the server's own port (the
//            router sends the internet's port 443 to it), on the "shortlived" profile (160 hours)
//
// What it keeps, in the certificates folder: the route (acme.json: which, for what names, how the
// last try went, when it's renewed), the ACME account's key (account.key, 0600); the token in the
// platform's token store (the Keychain on macOS), never in acme.json, never shown or logged. The
// certificate itself goes where every certificate does (storage/certificates.js), taken up as it
// comes. Renewal: when the CA's renewal information says (RFC 9773), else with a third of the
// certificate's life left (30 days of 90; about 2 days of the shortlived profile's 6.7); looked at
// every hour; a failure tried again after an hour, then 6, then 24.

import { createPrivateKey, X509Certificate } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { AcmeClient, DIRECTORIES, issue, renewalIdOf } from "./net/acme.js";
import { DNS_HOSTS, dnsHost, duckdnsDomainOf, LOOKUP, visible } from "./net/dns-hosts.js";
import { newKey, pemOfKey } from "./net/x509.js";
import { isHome, plainAddress } from "./access/addresses.js";
import { CERTIFICATES } from "./storage/certificates.js";
import { ensureFolder, exists, readJSON, writeAtomic, writeJSON } from "./storage/files.js";

/** The routes, as the management page offers them. */
export const ROUTES = Object.freeze({
    duckdns: { label: "A free DuckDNS name", profile: null },
    dns: { label: "Your own domain", profile: null },
    ip: { label: "This home's IP address", profile: "shortlived" },
});

/** A route as it's said within a sentence ("a free DuckDNS name"). */
export const routeWords = (label) => `${label[0].toLowerCase()}${label.slice(1)}`;

export const ACME_FILE = "acme.json";
export const ACCOUNT_KEY = "account.key";
export const TOKENS_FILE = "tokens.json";

/** How often it looks whether it's time to renew, how often a DuckDNS name's pointed home, how long it waits after failing, and for a certificate being got as the server closes (ms). */
export const CERTIFY_TIMES = Object.freeze({ look: 3600 * 1000, point: 5 * 60 * 1000, retry: [3600 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000], close: 5000 });

// A DNS name as typed: lower-case, without a trailing dot; null if it isn't one
function nameOf(given) {
    const name = String(given ?? "").trim().toLowerCase().replace(/\.$/, "");

    return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name) ? name : null;
}

export class Certifier {
    /**
     * For `server` (world-server.js: its root, its certificate, answerChallenge(), useCertificate(),
     * journal). `directory` the CA (Let's Encrypt's, unless given); `fetch`, `lookup` (DNS),
     * `tokens` (where tokens are kept) and `clock` as the tests have them.
     */
    constructor(server, { directory = DIRECTORIES.letsencrypt, fetch = globalThis.fetch, lookup = LOOKUP, tokens, clock = Date.now, poll } = {}) {
        Object.assign(this, { server, directory, fetch, lookup, tokens, clock, poll });
        this.folder = path.join(server.root, CERTIFICATES);
        this.config = null;
        this.working = null;
        this.timers = [];
        this.token = null;
        this.home = null;

        /** Told each time a certificate's got, or couldn't be (server/world.js says so in Terminal). */
        this.onChange = null;
    }

    /** The route kept, if any (acme.json). */
    async open() {
        const file = path.join(this.folder, ACME_FILE);

        this.config = (await exists(file)) ? await readJSON(file) : null;

        return this;
    }

    async #save() {
        await ensureFolder(this.folder);
        await writeJSON(path.join(this.folder, ACME_FILE), this.config);
    }

    /** The ACME account's key: made the first time, kept 0600. */
    async #accountKey() {
        const file = path.join(this.folder, ACCOUNT_KEY);

        if (await exists(file)) {
            return createPrivateKey(await readFile(file, "utf8"));
        }

        const { privateKey } = newKey();

        await ensureFolder(this.folder);
        await writeAtomic(file, pemOfKey(privateKey));

        return privateKey;
    }

    #client(accountKey) {
        return new AcmeClient({ directory: this.config?.directory ?? this.directory, accountKey, contact: this.config?.email ?? null, fetch: this.fetch, ...(this.poll ? { poll: this.poll } : {}) });
    }

    /** The CA's terms of service (a URL), which the owner agrees to by setting a route up; null if it can't be reached. */
    async terms() {
        return this.#client(await this.#accountKey())
            .meta()
            .then((meta) => meta.termsOfService)
            .catch(() => null);
    }

    #host() {
        return this.config.route === "ip" ? null : dnsHost(this.config.host, { token: this.token, fetch: this.fetch });
    }

    /**
     * A route set up (§9.2): checked (the name, the token with its DNS host, the address), kept,
     * and a certificate asked for at once (in the background: state() says how it goes). `agree`
     * must be true: the owner agrees to the CA's terms of service. Throws, saying why, if it can't.
     */
    async setUp({ route, name = null, host = null, token = null, address = null, email = null, agree = false }) {
        if (!ROUTES[route]) {
            throw new Error("Choose how to get the certificate: a DuckDNS name, your own domain, or this home's IP address.");
        }

        if (agree !== true) {
            throw new Error("Getting a certificate means agreeing to Let's Encrypt's terms of service.");
        }

        if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
            throw new Error("That isn't an email address.");
        }

        let names;
        let kind = null;

        if (route === "ip") {
            const plain = plainAddress(address);

            if (!plain || isHome(plain)) {
                throw new Error("That isn't a public IP address: give the address the internet sees this home by.");
            }

            names = [plain];
            this.token = null;
        } else {
            const typed = nameOf(name);

            kind = route === "duckdns" ? "duckdns" : host;

            if (!typed || (route === "duckdns" && !duckdnsDomainOf(typed))) {
                throw new Error(route === "duckdns" ? "That isn't a DuckDNS name (yourname.duckdns.org)." : "That isn't a domain name.");
            }

            if (!DNS_HOSTS[kind] || DNS_HOSTS[kind].route !== route) {
                throw new Error("Choose the DNS host your domain's with.");
            }

            names = [typed];
        }

        const tokenName = `acme:${kind ?? "ip"}`;

        if (kind) {
            const given = typeof token === "string" ? token.trim() : "";
            const usable = given || (this.config?.host === kind ? await this.tokens.get(tokenName) : null);

            if (!usable) {
                throw new Error(`Paste in ${DNS_HOSTS[kind].token}.`);
            }

            // (The token tried with its host before anything's kept: refused, it says why)
            await dnsHost(kind, { token: usable, fetch: this.fetch }).check(names[0]);
            await this.tokens.set(tokenName, usable);
            this.token = usable;
        }

        this.config = { route, names, host: kind, directory: this.config?.directory ?? this.directory, email, profile: ROUTES[route].profile, agreed: new Date(this.clock()).toISOString(), issued: null, renewAt: null, tries: 0, retryAt: null, last: null };
        await this.#save();
        this.start();
        this.renew({ force: true }).catch(() => {});

        return this.state();
    }

    /** The route let go (its token too): the certificate stays till it runs out, but isn't renewed. */
    async forget() {
        if (this.config?.host) {
            await this.tokens.remove(`acme:${this.config.host}`).catch(() => {});
        }

        this.stop();
        this.config = null;
        await rm(path.join(this.folder, ACME_FILE), { force: true });
    }

    /** How it stands, for the management page: { route, names, host, working, issued, renewAt, retryAt, last: { at, ok, message } }, or null without a route. */
    state() {
        if (!this.config) {
            return null;
        }

        const { route, names, host, issued, renewAt, retryAt, last, profile } = this.config;

        return { route, label: ROUTES[route].label, names, host, hostLabel: host ? DNS_HOSTS[host].label : null, profile, working: Boolean(this.working), issued, renewAt, retryAt, last, pointedAt: this.home };
    }

    /** When to renew a certificate (ms): in the CA's suggested window, else with a third of its life left. */
    async #renewAt(client, cert) {
        const info = await client.renewalInfo(cert).catch(() => null);

        if (info) {
            return info.start + Math.random() * Math.max(0, info.end - info.start);
        }

        const parsed = new X509Certificate(cert);
        const end = Date.parse(parsed.validTo);

        return end - (end - Date.parse(parsed.validFrom)) / 3;
    }

    /**
     * A certificate got for the route if it's time (or `force`): proved, issued, kept and taken
     * up; the next renewal worked out. A failure's kept and said, and tried again later; the
     * certificate it had stays in use. Returns state().
     */
    renew({ force = false } = {}) {
        if (!this.config) {
            return Promise.resolve(null);
        }

        const now = this.clock();
        const due = force || !this.config.renewAt || now >= Date.parse(this.config.renewAt);

        if (this.working || !due || (!force && this.config.retryAt && now < Date.parse(this.config.retryAt))) {
            return this.working ?? Promise.resolve(this.state());
        }

        this.working = this.#issue().finally(() => (this.working = null));

        return this.working;
    }

    async #issue() {
        const { names, route } = this.config;
        const steps = [];
        const log = (line) => steps.push(line);

        try {
            if (route !== "ip" && !this.token) {
                this.token = await this.tokens.get(`acme:${this.config.host}`);
            }

            const accountKey = await this.#accountKey();
            const client = this.#client(accountKey);
            const host = this.#host();
            const { privateKey } = newKey();
            const current = this.server.certificate && this.config.issued ? await this.server.certificates.current() : null;
            const solvers = {
                "dns-01": {
                    prepare: async ({ name, value }) => {
                        const record = `_acme-challenge.${name}`;
                        const undo = await host.set(record, value);

                        await visible(record, value, { lookup: this.lookup });

                        return undo;
                    },
                },
                "tls-alpn-01": { prepare: ({ address, keyAuthorization }) => this.server.answerChallenge(address, keyAuthorization) },
            };
            const { cert } = await issue({ client, names, key: privateKey, solvers, profile: this.config.profile, replaces: current ? renewalIdOf(current.cert) : null, agree: true, log });
            const info = await this.server.useCertificate({ key: pemOfKey(privateKey), cert });
            const renewAt = await this.#renewAt(client, cert);

            Object.assign(this.config, { issued: new Date(this.clock()).toISOString(), renewAt: new Date(renewAt).toISOString(), tries: 0, retryAt: null, last: { at: new Date(this.clock()).toISOString(), ok: true, message: `Got a certificate for ${names.join(", ")}, running till ${info.notAfter.slice(0, 10)}.` } });
            await this.#save();
            await this.server.manage?.journal(`A certificate for ${names.join(", ")} was got from Let's Encrypt (${routeWords(ROUTES[route].label)}), running till ${info.notAfter.slice(0, 10)}.`);
        } catch (error) {
            const tries = (this.config.tries ?? 0) + 1;
            const wait = CERTIFY_TIMES.retry[Math.min(tries, CERTIFY_TIMES.retry.length) - 1];

            Object.assign(this.config, { tries, retryAt: new Date(this.clock() + wait).toISOString(), last: { at: new Date(this.clock()).toISOString(), ok: false, message: error.message, steps } });
            await this.#save();
            await this.server.manage?.journal(`Couldn't get a certificate for ${names.join(", ")}: ${error.message}`);
        }

        this.onChange?.(this.state());

        return this.state();
    }

    /** The DuckDNS name pointed at this home's address (DuckDNS sees it as the request comes). */
    async point() {
        if (this.config?.route !== "duckdns") {
            return null;
        }

        this.token ??= await this.tokens.get("acme:duckdns");

        const { address } = await dnsHost("duckdns", { token: this.token, fetch: this.fetch }).point(this.config.names[0]);

        this.home = address;

        return address;
    }

    /** Looking after the route: renewing when it's time, and pointing a DuckDNS name home. */
    start() {
        this.stop();

        if (!this.config) {
            return;
        }

        const every = (ms, work) => {
            const timer = setInterval(() => work().catch(() => {}), ms);

            timer.unref?.();
            this.timers.push(timer);
        };

        every(CERTIFY_TIMES.look, () => this.renew());

        if (this.config.route === "duckdns") {
            every(CERTIFY_TIMES.point, () => this.point());
            this.point().catch(() => {});
        }
    }

    stop() {
        for (const timer of this.timers) {
            clearInterval(timer);
        }

        this.timers = [];
    }

    /** Stopped, and a certificate being got waited for (`within` ms at most: a DNS record can take minutes to be seen), so it's kept or its failure said before the server's gone. */
    async close({ within = CERTIFY_TIMES.close } = {}) {
        this.stop();

        let timer;

        await Promise.race([this.working?.catch(() => {}), new Promise((resolve) => (timer = setTimeout(resolve, within)))]);
        clearTimeout(timer);
    }
}

/** Where tokens are kept where there's no keychain (in the certificates folder). */
export const tokensFileOf = (root) => path.join(root, CERTIFICATES, TOKENS_FILE);
