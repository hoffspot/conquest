// The DNS hosts DNS-01 can write to (generated/world_server_plan.md §9.2), each by its own HTTP
// API with a token its owner pastes in:
//
//   duckdns     route 1, a free name (name.duckdns.org): TXT records, and the name kept pointed
//               at the home's address (DuckDNS sees it as the request comes)
//   cloudflare  route 2, the owner's own domain on Cloudflare's free DNS (an API token that may
//               edit the zone's DNS)
//   desec       route 2, the owner's own domain on deSEC's free DNS (a deSEC token)
//
// Each is { set(name, value) -> undo, check() }; and visible(name, value) waits until a TXT
// record can be seen at its zone's own nameservers, as the certificate authority will look
// (asking a public resolver first could leave it remembering there's none).

import { promises as dnsPromises } from "node:dns";

/** The DNS hosts, as the management page offers them: what each is and where its token comes from. */
export const DNS_HOSTS = Object.freeze({
    duckdns: { label: "DuckDNS", route: "duckdns", token: "Your DuckDNS token (shown at the top of duckdns.org once you've signed in)" },
    cloudflare: { label: "Cloudflare", route: "dns", token: "A Cloudflare API token allowed to edit the zone's DNS (My Profile, API Tokens, \"Edit zone DNS\")" },
    desec: { label: "deSEC", route: "dns", token: "A deSEC token (Token management, at desec.io)" },
});

/** How long it waits for a record to be seen (ms), and between looks. */
export const DNS_LIMITS = Object.freeze({ visible: 180000, look: 5000, request: 20000 });

/** A DNS host's refusal, in words for the owner. */
export class DnsHostError extends Error {}

// A call to a DNS host's API: its JSON (or text), or a refusal naming the host
async function call(fetch, host, url, options = {}) {
    let response;

    try {
        response = await fetch(url, { ...options, signal: AbortSignal.timeout(DNS_LIMITS.request) });
    } catch (error) {
        throw new DnsHostError(`${host} couldn't be reached (${error.cause?.code ?? error.message}).`);
    }

    const text = await response.text();
    let body = text;

    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        // (DuckDNS answers in plain text)
    }

    if (!response.ok) {
        const why = body?.errors?.[0]?.message ?? body?.detail ?? (typeof body === "string" ? body : "");

        throw new DnsHostError(`${host} refused (${response.status}${why ? `: ${why}` : ""}).`);
    }

    return body;
}

/** A name's labels from itself up, without the root: a.b.c -> [a.b.c, b.c, c]. */
function upwards(name) {
    const labels = String(name).replace(/\.$/, "").toLowerCase().split(".");

    return labels.map((_, at) => labels.slice(at).join("."));
}

/** DuckDNS's own name for a domain under duckdns.org (sam for sam.duckdns.org, or x.sam.duckdns.org), or null. */
export function duckdnsDomainOf(name) {
    const found = /(?:^|\.)([a-z0-9-]+)\.duckdns\.org\.?$/i.exec(String(name));

    return found ? found[1].toLowerCase() : null;
}

/**
 * DuckDNS (route 1). Its TXT record is the domain's own, answered for every name under it, and
 * there's one at a time. `point()` keeps the name at the home's address: DuckDNS takes it from
 * where the request comes from. Returns { address, changed }.
 */
export function duckdns({ token, fetch = globalThis.fetch, base = "https://www.duckdns.org" }) {
    const update = async (domain, extra) => {
        const query = new URLSearchParams({ domains: domain, token, verbose: "true", ...extra });
        const text = String(await call(fetch, "DuckDNS", `${base}/update?${query}`));
        const [status, ...rest] = text.trim().split(/\r?\n/);

        if (status !== "OK") {
            throw new DnsHostError(`DuckDNS refused: is the token right, and is ${domain}.duckdns.org yours?`);
        }

        return rest;
    };

    const domainOf = (name) => {
        const domain = duckdnsDomainOf(name);

        if (!domain) {
            throw new DnsHostError(`${name} isn't a DuckDNS name (name.duckdns.org).`);
        }

        return domain;
    };

    return {
        kind: "duckdns",
        async set(name, value) {
            const domain = domainOf(name);

            await update(domain, { txt: value });

            return () => update(domain, { txt: "", clear: "true" });
        },
        async point(name) {
            const [address = "", , state = ""] = await update(domainOf(name), { ip: "" });

            return { address: address || null, changed: state === "UPDATED" };
        },
        async check(name) {
            await this.point(name);
        },
    };
}

/** Cloudflare's DNS (route 2): the zone a name's in found, then a TXT record made and deleted. */
export function cloudflare({ token, fetch = globalThis.fetch, base = "https://api.cloudflare.com/client/v4" }) {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const zoneOf = async (name) => {
        for (const candidate of upwards(name)) {
            const found = await call(fetch, "Cloudflare", `${base}/zones?name=${encodeURIComponent(candidate)}`, { headers });

            if (found?.result?.length) {
                return found.result[0].id;
            }
        }

        throw new DnsHostError(`Cloudflare has no zone for ${name} that this token may use.`);
    };

    return {
        kind: "cloudflare",
        async set(name, value) {
            const zone = await zoneOf(name);
            const made = await call(fetch, "Cloudflare", `${base}/zones/${zone}/dns_records`, { method: "POST", headers, body: JSON.stringify({ type: "TXT", name, content: `"${value}"`, ttl: 60 }) });

            return () => call(fetch, "Cloudflare", `${base}/zones/${zone}/dns_records/${made.result.id}`, { method: "DELETE", headers });
        },
        async check(name) {
            await zoneOf(name);
        },
    };
}

/** deSEC (route 2): the domain that owns a name found, then its TXT RRset written and emptied. */
export function desec({ token, fetch = globalThis.fetch, base = "https://desec.io/api/v1" }) {
    const headers = { Authorization: `Token ${token}`, "Content-Type": "application/json" };

    const domainOf = async (name) => {
        const found = await call(fetch, "deSEC", `${base}/domains/?owns_qname=${encodeURIComponent(name)}`, { headers });

        if (!found?.length) {
            throw new DnsHostError(`deSEC has no domain for ${name} that this token may use.`);
        }

        return found[0].name;
    };

    const write = (domain, subname, records) => call(fetch, "deSEC", `${base}/domains/${domain}/rrsets/`, { method: "PATCH", headers, body: JSON.stringify([{ subname, type: "TXT", ttl: 3600, records }]) });

    return {
        kind: "desec",
        async set(name, value) {
            const domain = await domainOf(name);
            const subname = name.slice(0, -(domain.length + 1));

            await write(domain, subname, [`"${value}"`]);

            return () => write(domain, subname, []);
        },
        async check(name) {
            await domainOf(name);
        },
    };
}

/** A DNS host of `kind` (DNS_HOSTS), with its token. */
export function dnsHost(kind, options) {
    const made = { duckdns, cloudflare, desec }[kind];

    if (!made) {
        throw new DnsHostError(`There's no DNS host called "${kind}".`);
    }

    return made(options);
}

/** How names are looked up (node:dns): a zone's nameservers, their addresses, and a TXT record asked of given servers. */
export const LOOKUP = Object.freeze({
    ns: (name) => dnsPromises.resolveNs(name),
    addresses: (host) => dnsPromises.resolve4(host),
    async txt(name, servers) {
        const resolver = new dnsPromises.Resolver({ timeout: 4000, tries: 2 });

        if (servers?.length) {
            resolver.setServers(servers);
        }

        return (await resolver.resolveTxt(name)).map((chunks) => chunks.join(""));
    },
});

/** The servers that answer for a name's zone: the nearest name up with NS records, its servers' addresses. Empty if none's found. */
export async function authoritativeFor(name, lookup = LOOKUP) {
    for (const candidate of upwards(name)) {
        const hosts = await lookup.ns(candidate).catch(() => null);

        if (hosts?.length) {
            const addresses = await Promise.all(hosts.map((host) => lookup.addresses(host).catch(() => [])));

            return addresses.flat();
        }
    }

    return [];
}

/**
 * Waited for until `name`'s TXT record holds `value` at its zone's own nameservers (or, if they
 * can't be found, as this computer sees it). Refused, saying so, if it isn't seen in `within` ms.
 */
export async function visible(name, value, { lookup = LOOKUP, within = DNS_LIMITS.visible, every = DNS_LIMITS.look } = {}) {
    const servers = await authoritativeFor(name, lookup);
    const end = Date.now() + within;

    for (;;) {
        const records = await lookup.txt(name, servers).catch(() => []);

        if (records.includes(value)) {
            return true;
        }

        if (Date.now() > end) {
            throw new DnsHostError(`The record for ${name} wasn't to be seen after ${Math.round(within / 1000)} s: the DNS host may be slow, or the token may not be for this name.`);
        }

        await new Promise((resolve) => setTimeout(resolve, every));
    }
}
