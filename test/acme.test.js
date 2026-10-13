// Free certificates (generated/world_server_plan.md §9.2, §15 S6b): ACME (RFC 8555) against a
// certificate authority of the tests' own (test/fake-acme.js) that checks every request as Let's
// Encrypt does; the DNS hosts' APIs (DuckDNS, Cloudflare, deSEC) faked, each writing the TXT
// records the CA looks up; the record waited for at its zone's own nameservers; tokens kept in the
// Keychain (its tool faked) or a file only the account can read, and never shown again; and the
// world server getting its certificate by each route (a DuckDNS name, an own domain, its IP address
// by TLS-ALPN-01 on its one port), renewing it when the CA's renewal information says, replacing the
// old one, trying again later when it fails, and letting the route go.
import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { after, before, describe, it } from "node:test";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { ACCOUNT_KEY, ACME_FILE, CERTIFY_TIMES } from "../server/certify.js";
import { AcmeClient, AcmeError, dnsValueOf, issue, jwkOf, keyAuthorizationOf, renewalIdOf, reverseNameOf, thumbprint } from "../server/net/acme.js";
import { cloudflare, desec, dnsHost, DnsHostError, duckdns, duckdnsDomainOf, visible } from "../server/net/dns-hosts.js";
import { newKey } from "../server/net/x509.js";
import { keychain } from "../server/platform/darwin.js";
import { tokenStore } from "../server/platform/index.js";
import { CERTIFICATES } from "../server/storage/certificates.js";
import { TokenFile } from "../server/storage/tokens.js";
import { WorldServer } from "../server/world-server.js";
import { dnsHosts, FakeAcme, lookupOf, TOKENS } from "./fake-acme.js";

// Short codes hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const made = [];
const servers = [];
const authorities = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    authorities.forEach((authority) => authority.close());
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

async function folder() {
    const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-acme-"));

    made.push(root);

    return root;
}

async function authority(options) {
    const fake = await new FakeAcme(options).start();

    authorities.push(fake);

    return fake;
}

// Whether the server's got its certificate, and is done getting it
const got = (server) => Boolean(server.certifier.state()?.issued && !server.certifier.state().working);

/** Tokens kept in memory, as the Keychain or the file keep them. */
function memoryTokens() {
    const kept = new Map();

    return { where: "memory", kept, get: async (name) => kept.get(name) ?? null, set: async (name, token) => void kept.set(name, token), remove: async (name) => kept.delete(name) };
}

// A raw HTTP request to a port: { status, json, text }
function raw(port, { method = "GET", route = "/", headers = {}, body = null }) {
    const text = body ? JSON.stringify(body) : null;

    return new Promise((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port, path: route, method, headers: { Host: `localhost:${port}`, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}), ...headers } }, (response) => {
            const parts = [];

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const said = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, text: said, json: said.startsWith("{") ? JSON.parse(said) : null });
            });
        });

        request.on("error", reject);
        request.end(text ?? undefined);
    });
}

// The management page on the computer itself: its calls, as the page makes them
async function mac(server) {
    const page = await raw(server.adminPort, {});
    const cookie = page.headers["set-cookie"][0].split(";")[0];

    return (method, route, body) => raw(server.adminPort, { method, route: `/api/v1${route}`, headers: { Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE }, body });
}

describe("ACME's pieces (net/acme.js)", () => {
    it("names an address in reverse for TLS-ALPN-01 (RFC 8738 §6), IPv4 and IPv6", () => {
        assert.equal(reverseNameOf("203.0.113.7"), "7.113.0.203.in-addr.arpa");
        assert.equal(reverseNameOf("2001:db8::1"), "1.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
        assert.equal(reverseNameOf("2001:DB8:0:0:1::2"), "2.0.0.0.0.0.0.0.0.0.0.0.1.0.0.0.0.0.0.0.0.0.0.0.8.b.d.0.1.0.0.2.ip6.arpa");
    });

    it("signs as the account's key says: its JWK (RFC 7638 thumbprint), the key authorization, the DNS record's value", () => {
        const { privateKey } = newKey();
        const jwk = jwkOf(privateKey);

        assert.deepEqual(Object.keys(jwk), ["crv", "kty", "x", "y"]);
        assert.equal(jwk.crv, "P-256");
        assert.match(thumbprint(privateKey), /^[A-Za-z0-9_-]{43}$/);
        assert.equal(thumbprint(privateKey), createHash("sha256").update(`{"crv":"P-256","kty":"EC","x":"${jwk.x}","y":"${jwk.y}"}`).digest("base64url"));
        assert.equal(keyAuthorizationOf("tok", privateKey), `tok.${thumbprint(privateKey)}`);
        assert.equal(dnsValueOf("tok.print"), createHash("sha256").update("tok.print").digest("base64url"));
    });
});

describe("a certificate got from the CA (net/acme.js issue)", () => {
    let fake;
    let solvers;

    before(async () => {
        fake = await authority();
        solvers = {
            "dns-01": {
                prepare: ({ name, value }) => {
                    const record = `_acme-challenge.${name}`;

                    fake.dns.set(record, new Set([value]));

                    return () => fake.dns.delete(record);
                },
            },
        };
    });

    it("by DNS-01: the account made (its terms agreed), the stale nonce tried again, the names proved, the request finalized, a chain the CA signed", async () => {
        const accountKey = newKey().privateKey;
        const key = newKey().privateKey;
        const client = new AcmeClient({ directory: fake.directory, accountKey, contact: "owner@example.com", poll: 20 });
        const said = [];
        const { cert, order } = await issue({ client, names: ["sam.duckdns.org"], key, solvers, agree: true, log: (line) => said.push(line) });
        const leaf = new X509Certificate(cert);

        assert.equal(order.status, "valid");
        assert.equal(leaf.subjectAltName, "DNS:sam.duckdns.org");
        assert.ok(leaf.checkPrivateKey(key));
        assert.ok(leaf.verify(fake.ca.publicKey));
        assert.equal(Math.round((Date.parse(leaf.validTo) - Date.parse(leaf.validFrom)) / 86400000), 90);
        assert.equal(cert.match(/BEGIN CERTIFICATE/g).length, 2, "the chain: the certificate and its issuer");
        assert.ok(fake.requests.filter((request) => request === "POST /account").length >= 2, "the first nonce refused as stale, the account asked for again");
        assert.deepEqual([...fake.accounts.values()][0].contact, ["mailto:owner@example.com"]);
        assert.equal(fake.dns.size, 0, "the record taken down once it's proved");
        assert.deepEqual(said, ["Asking for a certificate for sam.duckdns.org.", "Proving sam.duckdns.org (dns-01).", "sam.duckdns.org proved.", "Issued."]);

        // (The same account's key finds its account again: no second one made)
        const again = new AcmeClient({ directory: fake.directory, accountKey, poll: 20 });

        await issue({ client: again, names: ["sam.duckdns.org"], key, solvers, agree: true });
        assert.equal(fake.accounts.size, 1);
    });

    it("refuses to make an account whose terms of service aren't agreed", async () => {
        const client = new AcmeClient({ directory: fake.directory, accountKey: newKey().privateKey, poll: 20 });

        await assert.rejects(issue({ client, names: ["sam.duckdns.org"], key: newKey().privateKey, solvers }), (error) => error instanceof AcmeError && error.type === "userActionRequired" && /terms of service/.test(error.message));
    });

    it("says why a proof was refused, in the CA's words, and takes its record down", async () => {
        fake.fail = (identifier) => identifier.value === "nope.example.com";

        try {
            const client = new AcmeClient({ directory: fake.directory, accountKey: newKey().privateKey, poll: 20 });

            await assert.rejects(issue({ client, names: ["nope.example.com"], key: newKey().privateKey, solvers, agree: true }), (error) => error instanceof AcmeError && error.type === "incorrectResponse" && error.message === "The test made it fail.");
            assert.equal(fake.dns.size, 0);
        } finally {
            fake.fail = null;
        }
    });

    it("an IP address on the shortlived profile alone (160 hours); a name it can't prove refused before anything's asked of the CA", async () => {
        const client = new AcmeClient({ directory: fake.directory, accountKey: newKey().privateKey, poll: 20 });

        await assert.rejects(issue({ client, names: ["203.0.113.7"], key: newKey().privateKey, solvers, agree: true }), (error) => error.type === "rejectedIdentifier");
        await assert.rejects(issue({ client, names: ["203.0.113.7"], key: newKey().privateKey, solvers, profile: "shortlived", agree: true }), (error) => error.type === "unsupportedIdentifier" && /no tls-alpn-01/.test(error.message));
        assert.deepEqual(await client.meta().then(({ profiles }) => Object.keys(profiles)), ["classic", "shortlived"]);
    });

    it("tells when to renew (RFC 9773: the certificate known by its authority key and serial), and a renewal names the one it replaces", async () => {
        const client = new AcmeClient({ directory: fake.directory, accountKey: newKey().privateKey, poll: 20 });
        const { cert } = await issue({ client, names: ["renew.example.com"], key: newKey().privateKey, solvers, agree: true });
        const leaf = new X509Certificate(cert);
        const info = await client.renewalInfo(cert);
        const lifetime = Date.parse(leaf.validTo) - Date.parse(leaf.validFrom);

        assert.match(renewalIdOf(cert), /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        assert.ok(fake.issued.has(renewalIdOf(cert)));
        assert.ok(Math.abs(info.start - (Date.parse(leaf.validTo) - lifetime / 3)) < 2000);
        assert.ok(info.end > info.start);
        assert.equal(info.retry, 21600000);

        await issue({ client, names: ["renew.example.com"], key: newKey().privateKey, solvers, agree: true, replaces: renewalIdOf(cert) });
        assert.equal([...fake.orders.values()].at(-1).replaces, renewalIdOf(cert));
    });
});

describe("the DNS hosts (net/dns-hosts.js), their APIs faked", () => {
    it("DuckDNS: the record set for the domain and cleared after, the name pointed home; a wrong token refused", async () => {
        const dns = new Map();
        const { fetch, asked } = dnsHosts(dns);
        const host = duckdns({ token: TOKENS.duckdns, fetch });
        const undo = await host.set("_acme-challenge.sam.duckdns.org", "value-1");

        assert.deepEqual([...dns.get("_acme-challenge.sam.duckdns.org")], ["value-1"]);
        assert.equal(new URL(asked[0].url).searchParams.get("domains"), "sam");
        await undo();
        assert.equal(dns.size, 0);
        assert.equal(new URL(asked[1].url).searchParams.get("clear"), "true");
        assert.deepEqual(await host.point("sam.duckdns.org"), { address: "198.51.100.20", changed: true });
        assert.equal(new URL(asked[2].url).searchParams.get("ip"), "", "DuckDNS takes the address from where the request comes");

        await assert.rejects(duckdns({ token: "wrong-token-00000", fetch }).check("sam.duckdns.org"), (error) => error instanceof DnsHostError && /is the token right, and is sam\.duckdns\.org yours/.test(error.message));
        await assert.rejects(host.set("_acme-challenge.example.com", "v"), /isn't a DuckDNS name/);
        assert.equal(duckdnsDomainOf("x.Sam.duckdns.org."), "sam");
        assert.equal(duckdnsDomainOf("duckdns.org"), null);
    });

    it("Cloudflare: the zone found up from the name, the record made and deleted; a token it refuses said in its words", async () => {
        const dns = new Map();
        const { fetch, asked } = dnsHosts(dns);
        const host = cloudflare({ token: TOKENS.cloudflare, fetch });
        const undo = await host.set("_acme-challenge.play.example.com", "value-2");

        assert.deepEqual(asked.slice(0, 3).map(({ url }) => new URL(url).searchParams.get("name")), ["_acme-challenge.play.example.com", "play.example.com", "example.com"]);
        assert.deepEqual(asked[3].body, { type: "TXT", name: "_acme-challenge.play.example.com", content: '"value-2"', ttl: 60 });
        assert.deepEqual([...dns.get("_acme-challenge.play.example.com")], ["value-2"]);
        await undo();
        assert.equal(asked.at(-1).method, "DELETE");
        assert.equal(dns.size, 0);

        await assert.rejects(cloudflare({ token: "not-the-token-0000", fetch }).check("play.example.com"), (error) => error instanceof DnsHostError && error.message === "Cloudflare refused (403: Invalid access token).");
        await assert.rejects(host.check("play.example.org"), /Cloudflare has no zone for play\.example\.org/);
    });

    it("deSEC: the domain that owns the name found, its TXT RRset written and emptied; a wrong token refused", async () => {
        const dns = new Map();
        const { fetch, asked } = dnsHosts(dns);
        const host = desec({ token: TOKENS.desec, fetch });
        const undo = await host.set("_acme-challenge.play.example.com", "value-3");

        assert.equal(new URL(asked[0].url).searchParams.get("owns_qname"), "_acme-challenge.play.example.com");
        assert.deepEqual(asked[1].body, [{ subname: "_acme-challenge.play", type: "TXT", ttl: 3600, records: ['"value-3"'] }]);
        assert.deepEqual([...dns.get("_acme-challenge.play.example.com")], ["value-3"]);
        await undo();
        assert.deepEqual(asked.at(-1).body[0].records, []);
        assert.equal(dns.size, 0);

        await assert.rejects(desec({ token: "not-the-token-0000", fetch }).check("play.example.com"), /deSEC refused \(401: Invalid token\.\)/);
        assert.throws(() => dnsHost("route53", {}), /no DNS host called "route53"/);
    });

    it("waits until the record's seen at the zone's own nameservers, and says so if it never is", async () => {
        const dns = new Map([["_acme-challenge.play.example.com", new Set(["seen"])]]);
        const lookup = lookupOf(dns, { late: 2 });

        assert.equal(await visible("_acme-challenge.play.example.com", "seen", { lookup, within: 5000, every: 10 }), true);
        assert.equal(lookup.asked.length, 3, "looked again till it was there");
        assert.ok(lookup.asked.every(({ servers }) => servers.join() === "192.0.2.53"), "asked of example.com's own nameserver");

        await assert.rejects(visible("_acme-challenge.play.example.com", "never", { lookup, within: 50, every: 10 }), (error) => error instanceof DnsHostError && /wasn't to be seen after 0 s/.test(error.message));
    });
});

describe("tokens, kept and never shown (storage/tokens.js, platform/ keychain)", () => {
    it("in a file only the account can read, where there's no keychain", async () => {
        const file = path.join(await folder(), CERTIFICATES, "tokens.json");
        const tokens = new TokenFile(file);

        assert.equal(await tokens.get("acme:duckdns"), null);
        await tokens.set("acme:duckdns", TOKENS.duckdns);
        await tokens.set("acme:desec", TOKENS.desec);
        assert.equal(await tokens.get("acme:duckdns"), TOKENS.duckdns);
        assert.equal((await stat(file)).mode & 0o777, 0o600);
        assert.equal((await stat(path.dirname(file))).mode & 0o777, 0o700);
        await assert.rejects(tokens.set("acme:duckdns", "has spaces in it"), /doesn't look like a token/);
        await assert.rejects(tokens.set("acme:duckdns", 'quote"d-token'), /doesn't look like a token/);
        assert.equal(await tokens.remove("acme:duckdns"), true);
        assert.equal(await tokens.remove("acme:desec"), true);
        await assert.rejects(stat(file), { code: "ENOENT" });
        assert.equal(tokenStore({ system: "linux", file }).constructor, TokenFile);
    });

    it("in macOS's Keychain, through security: the token on its standard input, never on a command line", async () => {
        const ran = [];
        const kept = new Map();
        const execFile = (tool, args, options, done) => {
            ran.push([tool, ...args]);

            const name = args[args.indexOf("-a") + 1];

            if (args[0] === "find-generic-password") {
                kept.has(name) ? done(null, `${kept.get(name)}\n`) : done(Object.assign(new Error("not found"), { code: 44 }));
            } else if (args[0] === "delete-generic-password") {
                kept.delete(name) ? done(null, "") : done(Object.assign(new Error("not found"), { code: 44 }));
            }
        };
        const spawn = (tool, args) => {
            const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stderr: new PassThrough() });
            let said = "";

            ran.push([tool, ...args]);
            child.stdin.on("data", (part) => (said += part));
            child.stdin.on("end", () => {
                const [, name, token] = /-a "([^"]+)" -w "([^"]+)"/.exec(said);

                kept.set(name, token);
                child.stderr.end();
                child.emit("close", 0);
            });

            return child;
        };
        const store = keychain({ spawn, execFile, service: "Pellagos Test" });

        assert.equal(store.where, "the Keychain");
        assert.equal(await store.get("acme:duckdns"), null);
        await store.set("acme:duckdns", TOKENS.duckdns);
        assert.equal(await store.get("acme:duckdns"), TOKENS.duckdns);
        assert.ok(ran.every((command) => !command.includes(TOKENS.duckdns)), "never on a command line");
        assert.deepEqual(ran[1], ["/usr/bin/security", "-i"]);
        assert.deepEqual(ran[2], ["/usr/bin/security", "find-generic-password", "-s", "Pellagos Test", "-a", "acme:duckdns", "-w"]);
        await assert.rejects(store.set("acme:duckdns", 'x" ; delete-keychain "y'), /doesn't look like a token/);
        assert.equal(await store.remove("acme:duckdns"), true);
        assert.equal(await store.remove("acme:duckdns"), false);
        assert.equal(typeof tokenStore({ system: "darwin", spawn, execFile }).get, "function");
        assert.equal(tokenStore({ system: "darwin", spawn, execFile }).where, "the Keychain");
    });
});

describe("free certificates in the world server (certify.js), by each route", () => {
    let fake;
    let hosts;
    let lookup;

    // A world server whose certificate authority is the fake one, the DNS hosts and DNS faked
    async function serve({ root = null, tokens = memoryTokens() } = {}) {
        const server = await WorldServer.open(root ?? (await folder()), { cost: CHEAP, awake: () => ({ stop() {} }), acme: { directory: fake.directory, fetch: hosts.fetch, lookup, poll: 20 }, tokens });

        servers.push(server);
        await server.settings.change({ setAsideMinutes: 0 });
        await server.listen(0, "127.0.0.1");
        await server.listenAdmin(0);

        return server;
    }

    before(async () => {
        fake = await authority();
        hosts = dnsHosts(fake.dns);
        lookup = lookupOf(fake.dns);
    });

    it("its own IP address, proved by TLS-ALPN-01 on its one port, on the shortlived profile", async () => {
        const server = await serve();

        fake.ports["203.0.113.7"] = server.port;

        const state = await server.certifier.setUp({ route: "ip", address: "203.0.113.7", agree: true });

        assert.equal(state.route, "ip");
        assert.deepEqual(state.names, ["203.0.113.7"]);
        await until(() => got(server), "a certificate");

        const leaf = new X509Certificate((await server.certificates.current()).cert);

        assert.deepEqual(server.certificate.names, ["203.0.113.7"]);
        assert.equal(server.certificate.issuer, "Fake ACME CA");
        assert.equal(leaf.subjectAltName, "IP Address:203.0.113.7");
        assert.equal(Math.round((Date.parse(leaf.validTo) - Date.parse(leaf.validFrom)) / 3600000), 160);
        assert.equal(server.challenges.size, 0, "the challenge's certificate let go once it's proved");
        assert.equal(server.certifier.state().last.ok, true);
        await until(async () => /A certificate for 203\.0\.113\.7 was got from Let's Encrypt \(this home's IP address\)/.test(JSON.stringify(await server.manage.activity())), "the journal's line");
    });

    it("a DuckDNS name, set up from the management page: the token tried, kept and never said back; the name pointed home; the certificate taken up", async () => {
        const tokens = memoryTokens();
        const server = await serve({ tokens });
        const call = await mac(server);

        const choices = await call("GET", "/server/certificate/acme");

        assert.equal(choices.status, 200);
        assert.equal(choices.json.terms, `${fake.base}/terms`);
        assert.deepEqual(Object.keys(choices.json.routes), ["duckdns", "dns", "ip"]);
        assert.equal(choices.json.hosts.duckdns.label, "DuckDNS");

        const refused = await call("POST", "/server/certificate/acme", { route: "duckdns", name: "sam.duckdns.org", token: "wrong-token-00000", agree: true });

        assert.equal(refused.status, 400);
        assert.match(refused.json.message, /DuckDNS refused/);
        assert.equal(tokens.kept.size, 0, "a token that doesn't work isn't kept");

        const set = await call("POST", "/server/certificate/acme", { route: "duckdns", name: "Sam.DuckDNS.org", token: TOKENS.duckdns, email: "owner@example.com", agree: true });

        assert.equal(set.status, 200);
        assert.equal(tokens.kept.get("acme:duckdns"), TOKENS.duckdns);
        await until(() => got(server), "a certificate");
        assert.deepEqual(server.certificate.names, ["sam.duckdns.org"]);
        assert.equal(server.certifier.state().pointedAt, "198.51.100.20");

        const overview = await call("GET", "/server");
        const { acme } = overview.json.overview.internet;

        assert.equal(acme.route, "duckdns");
        assert.equal(acme.hostLabel, "DuckDNS");
        assert.match(acme.words, /^Gets its certificate for sam\.duckdns\.org from Let's Encrypt \(a free DuckDNS name\) and renews it itself: next about \d{4}-\d\d-\d\d\. The name points at 198\.51\.100\.20\.$/);
        assert.ok(!overview.text.includes(TOKENS.duckdns), "the token's never shown");

        const kept = await readFile(path.join(server.root, CERTIFICATES, ACME_FILE), "utf8");

        assert.ok(!kept.includes(TOKENS.duckdns), "nor kept beside the route");
        assert.equal(JSON.parse(kept).email, "owner@example.com");
        assert.equal((await stat(path.join(server.root, CERTIFICATES, ACCOUNT_KEY))).mode & 0o777, 0o600);
        assert.ok(!JSON.stringify(await server.manage.activity()).includes(TOKENS.duckdns), "nor journalled");

        // (Let go: the route and its token forgotten, the certificate kept till it runs out)
        const forgot = await call("DELETE", "/server/certificate/acme");

        assert.equal(forgot.status, 200);
        assert.equal(forgot.json.internet.acme, null);
        assert.equal(tokens.kept.size, 0);
        assert.deepEqual(server.certificate.names, ["sam.duckdns.org"]);
        assert.equal((await call("POST", "/server/certificate/acme/renew")).status, 409);
    });

    it("an own domain on Cloudflare or deSEC; refused, saying why, for a token or a name that won't do", async () => {
        const server = await serve();
        const call = await mac(server);
        const ask = (body) => call("POST", "/server/certificate/acme", { route: "dns", agree: true, ...body });

        assert.match((await ask({ name: "play.example.com", host: "cloudflare", token: "not-the-token-0000" })).json.message, /Cloudflare refused \(403: Invalid access token\)/);
        assert.match((await ask({ name: "not a name", host: "desec", token: TOKENS.desec })).json.message, /isn't a domain name/);
        assert.match((await ask({ name: "play.example.com", host: "duckdns", token: TOKENS.duckdns })).json.message, /Choose the DNS host/);
        assert.match((await ask({ name: "play.example.com", host: "desec", token: TOKENS.desec, agree: false })).json.message, /agreeing to Let's Encrypt's terms of service/);
        assert.match((await ask({ name: "play.example.com", host: "desec", token: TOKENS.desec, email: "nobody" })).json.message, /isn't an email address/);
        assert.match((await call("POST", "/server/certificate/acme", { route: "ip", address: "192.168.1.20", agree: true })).json.message, /isn't a public IP address/);
        assert.equal(server.certifier.state(), null, "nothing kept");

        assert.equal((await ask({ name: "play.example.com", host: "desec", token: TOKENS.desec })).status, 200);
        await until(() => got(server), "a certificate");
        assert.deepEqual(server.certificate.names, ["play.example.com"]);
        assert.ok(lookup.asked.some(({ name, servers }) => name === "_acme-challenge.play.example.com" && servers.join() === "192.0.2.53"), "waited for at example.com's own nameserver");
        assert.equal(fake.dns.size, 0, "the record taken down");
    });

    it("renews when the CA says (replacing the old one), tries again later when it fails, and carries on after a restart", async () => {
        const root = await folder();
        const tokens = memoryTokens();
        let server = await serve({ root, tokens });

        await server.certifier.setUp({ route: "dns", host: "cloudflare", name: "play.example.com", token: TOKENS.cloudflare, agree: true });
        await until(() => got(server), "a certificate");

        const first = server.certificate.fingerprint;
        const { renewAt } = server.certifier.state();
        const lifetime = 90 * 86400000;

        // (Renewed in the CA's window: two thirds of the way through)
        assert.ok(Math.abs(Date.parse(renewAt) - (Date.now() + (lifetime * 2) / 3)) < lifetime * 0.06);

        // (Not before its time)
        await server.certifier.renew();
        assert.equal(server.certificate.fingerprint, first);

        // (Its time come: renewed, naming the one it replaces)
        server.certifier.clock = () => Date.parse(renewAt) + 1000;
        await server.certifier.renew();
        assert.notEqual(server.certificate.fingerprint, first);
        assert.ok([...fake.orders.values()].at(-1).replaces, "the renewal says which it replaces");

        // (Failing: the certificate it has kept, tried again after an hour, then six)
        const second = server.certificate.fingerprint;

        fake.fail = () => true;

        try {
            await server.certifier.renew({ force: true });

            let state = server.certifier.state();
            const now = server.certifier.clock();

            assert.equal(state.last.ok, false);
            assert.equal(state.last.message, "The test made it fail.");
            assert.equal(Date.parse(state.retryAt) - now, CERTIFY_TIMES.retry[0]);
            assert.equal(server.certificate.fingerprint, second);
            assert.match((await server.manage.internet()).acme.words, /^Couldn't get a certificate for play\.example\.com: The test made it fail\. It tries again at/);

            // (Not tried again before then, unless asked)
            const asked = fake.requests.length;

            server.certifier.clock = () => now + CERTIFY_TIMES.retry[0] - 1000;
            await server.certifier.renew();
            assert.equal(fake.requests.length, asked);
            server.certifier.clock = () => now;
            await server.certifier.renew({ force: true });
            state = server.certifier.state();
            assert.equal(Date.parse(state.retryAt) - now, CERTIFY_TIMES.retry[1]);
        } finally {
            fake.fail = null;
        }

        // (Opened again, it knows its route: asked from the page, it renews at once)
        await server.close();
        server = await serve({ root, tokens });
        assert.equal(server.certifier.state().route, "dns");
        assert.equal(server.certificate.fingerprint, second);

        const call = await mac(server);

        assert.equal((await call("POST", "/server/certificate/acme/renew")).status, 200);
        await until(() => server.certifier.state().last.ok && server.certificate.fingerprint !== second, "renewed");
        assert.equal(server.certifier.state().retryAt, null);
    });
});
