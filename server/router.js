// The home's router asked to let the internet in (generated/world_server_plan.md §9.3), while the
// server answers the internet (its `internet` setting) and may ask (its `router` setting): the
// play port forwarded to this computer, the same port outside as in (and the internet's 443 to it
// too while its certificate is for the IP address: TLS-ALPN-01 comes there). Asked, in turn:
//
//   PCP (RFC 6887)      net/pcp.js      the gateway, UDP 5351
//   NAT-PMP (RFC 6886)  net/natpmp.js   the same port: a router that speaks one speaks this
//   UPnP-IGD            net/upnp.js     found by SSDP, asked by SOAP
//
// Each mapping is asked for 2 hours and renewed at half its life; let go when the internet's no
// longer answered, or the server stops. Over IPv6 there's nothing to forward, but the router's
// firewall shuts the internet out: a pinhole's asked for this computer's own address (PCP over
// IPv6, or UPnP's IPv6 firewall), as best it can be.
//
// Then how far it got (check): how the internet sees this home (STUN, net/stun.js) against the
// router's own public address; a provider sharing one address between homes (CGNAT: the router's
// address in 100.64/10, or private, or not the one the internet sees) said plainly, since then no
// router setting helps; and whether the server reaches itself by its public address (a hairpin:
// success proves the port's open, failure proves nothing, as many routers don't hairpin). If the
// router won't, the page says how to forward the port by hand.

import os from "node:os";
import { BlockList, isIP } from "node:net";
import { isHome, plainAddress } from "./access/addresses.js";
import { NATPMP_PORT, natpmp } from "./net/natpmp.js";
import { pcp, PcpUnsupported } from "./net/pcp.js";
import { publicAddress, STUN_SERVERS } from "./net/stun.js";
import { NoAnswer } from "./net/udp.js";
import { search, SSDP, upnp } from "./net/upnp.js";
import { gateways as platformGateways } from "./platform/index.js";

/** How long a mapping's asked for (s), how long it waits after failing (ms), and for a hairpin (ms). */
export const ROUTER_TIMES = Object.freeze({ lifetime: 7200, retry: [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000], hairpin: 3000 });

/** The ways it asks, in words. */
export const METHODS = Object.freeze({ pcp: "PCP", natpmp: "NAT-PMP", upnp: "UPnP" });

const CARRIER = new BlockList();

CARRIER.addSubnet("100.64.0.0", 10, "ipv4");

// Whether an IPv4 address is in the same network as another (by a netmask)
function sameNetwork(address, other, netmask) {
    const bits = (text) => text.split(".").reduce((value, part) => (value << 8) | Number(part), 0) >>> 0;

    return (bits(address) & bits(netmask)) >>> 0 === (bits(other) & bits(netmask)) >>> 0;
}

/**
 * The provider's sharing, from the router's public address and the one the internet sees:
 * "carrier" (100.64/10: CGNAT), "double" (a private address: another router upstream),
 * "beyond" (the internet sees another address), or null.
 */
export function sharingOf(external, seen) {
    const plain = plainAddress(external);

    if (!plain) {
        return null;
    }

    if (isIP(plain) === 4 && CARRIER.check(plain, "ipv4")) {
        return "carrier";
    }

    if (isHome(plain)) {
        return "double";
    }

    return seen && plainAddress(seen) !== plain ? "beyond" : null;
}

export class Router {
    /**
     * For `server` (world-server.js: its port, settings, certifier, hairpin()). For the tests:
     * `gateways` (async: { v4, v6 }), `lan` and `v6` (this computer's addresses, else from its
     * interfaces), `port` (where PCP and NAT-PMP are asked), `ssdp` (where SSDP's searches go),
     * `stun` (STUN servers), `reach` (the address a public one's reached by), `quick` (shorter
     * waits), `fetch`, `clock`.
     */
    constructor(server, { gateways = platformGateways, lan = null, v6 = undefined, port = NATPMP_PORT, ssdp = SSDP, stun = STUN_SERVERS, reach = (address) => address, quick = false, fetch = globalThis.fetch, clock = Date.now } = {}) {
        Object.assign(this, { server, findGateways: gateways, lanGiven: lan, v6Given: v6, protocolPort: port, ssdp, stunServers: stun, reach, fetch, clock });
        this.waits = quick ? { tries: 2, first: 50, search: 300 } : { tries: 4, first: 250, search: 2000 };
        this.on = false;
        this.working = null;
        this.timer = null;
        this.tries = 0;
        this.reset();

        /** Told each time it's asked the router, and how it went (server/world.js says so in Terminal). */
        this.onChange = null;
    }

    reset() {
        Object.assign(this, { method: null, device: null, gateway: null, lan: null, mappings: [], pinhole: null, external: null, seen: null, sharing: null, hairpin: null, error: null, retryAt: null, checkedAt: null });
    }

    /**
     * The mappings it wants: the play port, the same outside; and, while the certificate's for the
     * IP address, the internet's 443 to the server's second port (world-server.js secondPort).
     */
    async wanted() {
        const port = this.server.port;
        const ip = this.server.certifier?.config?.route === "ip";

        if (!port) {
            return [];
        }

        return [{ internal: port, external: port }, ...(ip && port !== 443 ? [{ internal: await this.server.secondPort(), external: 443 }] : [])];
    }

    /** How it stands, for the management page. */
    state() {
        return {
            on: this.on,
            working: Boolean(this.working),
            method: this.method,
            methodLabel: this.method ? METHODS[this.method] : null,
            gateway: this.gateway,
            lan: this.lan,
            mappings: this.mappings.map(({ internal, external, lifetime, until }) => ({ internal, external, lifetime, until: until ? new Date(until).toISOString() : null })),
            pinhole: this.pinhole && { address: this.pinhole.address, port: this.pinhole.port, method: this.pinhole.method },
            external: this.external,
            seen: this.seen,
            sharing: this.sharing,
            hairpin: this.hairpin,
            error: this.error,
            retryAt: this.retryAt ? new Date(this.retryAt).toISOString() : null,
            checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
        };
    }

    /** Asking the router or not (`on`: the internet's answered and the `router` setting's on); asked again when it was on and `again`. */
    follow(on, { again = false } = {}) {
        if (!on) {
            this.on = false;

            return this.close();
        }

        if (this.on && !again && (this.method || this.working)) {
            return this.working ?? Promise.resolve(this.state());
        }

        this.on = true;

        return this.#start();
    }

    /** Asked again: the mappings it wants may have changed (the certificate's route), or the owner asks. */
    refresh() {
        return this.on ? this.follow(true, { again: true }) : Promise.resolve(this.state());
    }

    #start() {
        clearTimeout(this.timer);

        const previous = this.working ?? Promise.resolve();

        this.working = previous
            .catch(() => {})
            .then(() => this.#open())
            .finally(() => {
                this.working = null;
                this.onChange?.(this.state());
            });

        return this.working;
    }

    // This computer's LAN address (the one in the gateway's network), and its global IPv6 address
    #addresses(gateway) {
        const interfaces = Object.values(this.server.interfaces ?? os.networkInterfaces()).flat().filter((one) => one && !one.internal);
        const v4 = interfaces.filter((one) => one.family === "IPv4" || one.family === 4);
        const lan = this.lanGiven ?? (v4.find((one) => gateway && sameNetwork(one.address, gateway, one.netmask)) ?? v4.find((one) => isHome(one.address)))?.address ?? null;
        const v6 =
            this.v6Given !== undefined
                ? this.v6Given
                : (interfaces.find((one) => (one.family === "IPv6" || one.family === 6) && !one.scopeid && !isHome(one.address))?.address ?? null);

        return { lan, v6 };
    }

    async #open() {
        const before = this.mappings;
        const keep = { method: this.method, device: this.device, pinhole: this.pinhole };

        this.reset();

        if (!this.on) {
            return this.state();
        }

        const { v4: gateway, v6: gateway6 } = await this.findGateways().catch(() => ({ v4: null, v6: null }));
        const { lan, v6 } = this.#addresses(gateway);

        Object.assign(this, { gateway, lan });

        if (!gateway || !lan) {
            return this.#failed(new Error("The router (the default gateway) couldn't be found."));
        }

        // (What it had, let go first where it's no longer wanted)
        const wanted = await this.wanted();

        await this.#unmap(
            before.filter((one) => !wanted.some((want) => want.external === one.external)),
            keep,
        );

        const reasons = [];

        for (const method of ["pcp", "natpmp", "upnp"]) {
            try {
                const done = await this.#via(method, { gateway, lan, wanted, before: keep.method === method ? before : [] });

                if (done) {
                    break;
                }
            } catch (error) {
                // (Silence, or "I speak NAT-PMP", says nothing the next way won't)
                if (!(error instanceof PcpUnsupported) && !(error instanceof NoAnswer)) {
                    reasons.push(`${METHODS[method]}: ${error.message}`);
                }
            }

            if (!this.on) {
                return this.state();
            }
        }

        if (!this.method) {
            return this.#failed(new Error(reasons.length ? reasons.join(" ") : "The router answered none of PCP, NAT-PMP or UPnP: they may be turned off in its settings."));
        }

        this.tries = 0;

        await this.#pinhole({ gateway6, v6, before: keep.pinhole, device: keep.device }).catch(() => {});

        this.#renewLater();
        await this.check().catch(() => {});

        return this.state();
    }

    // The mappings asked for by one method (a PCP mapping renewed by the nonce it was made with); true if it gave them all
    async #via(method, { gateway, lan, wanted, before }) {
        const options = { tries: this.waits.tries, first: this.waits.first };
        let device;

        if (method === "pcp") {
            device = pcp({ gateway, client: lan, port: this.protocolPort, ...options });
        } else if (method === "natpmp") {
            device = natpmp({ gateway, port: this.protocolPort, ...options });
            this.external = (await device.externalAddress()).address;
        } else {
            const locations = await search({ target: this.ssdp, within: this.waits.search });
            const location = locations.find((one) => new URL(one).hostname === gateway) ?? locations[0];

            if (!location) {
                return false;
            }

            device = await upnp({ location, client: lan, fetch: this.fetch });

            if (!device) {
                return false;
            }

            this.external = (await device.externalAddress()).address;
        }

        const mappings = [];

        for (const want of wanted) {
            const nonce = before.find((one) => one.external === want.external)?.nonce;
            const got = await device.map({ internalPort: want.internal, externalPort: want.external, lifetime: ROUTER_TIMES.lifetime, ...(nonce ? { nonce } : {}) });

            this.external = got.externalAddress && got.externalAddress !== "0.0.0.0" ? got.externalAddress : this.external;
            mappings.push({ internal: want.internal, external: got.externalPort, lifetime: got.lifetime, until: got.lifetime ? this.clock() + got.lifetime * 1000 : null, nonce: got.nonce ?? null });
        }

        Object.assign(this, { method, device, mappings });

        return true;
    }

    // A pinhole through the router's IPv6 firewall for this computer's own address: PCP over IPv6, else UPnP's.
    // The one it had is kept (PCP's by the nonce it was made with, UPnP's by its id), or let go if the
    // address has changed.
    async #pinhole({ gateway6, v6, before, device: had }) {
        const port = this.server.port;
        const same = before && before.address === v6 && before.port === port ? before : null;
        const lifetime = ROUTER_TIMES.lifetime;

        if (before && !same) {
            await this.#unpinhole(before, had);
        }

        if (!v6) {
            return;
        }

        if (gateway6) {
            const device = pcp({ gateway: gateway6, client: v6, port: this.protocolPort, tries: this.waits.tries, first: this.waits.first });
            const nonce = same?.method === "pcp" ? same.nonce : undefined;
            const got = await device.map({ internalPort: port, externalPort: port, lifetime, ...(nonce ? { nonce } : {}) }).catch(() => null);

            if (got) {
                this.pinhole = { method: "pcp", address: v6, port, device, nonce: got.nonce, until: this.clock() + got.lifetime * 1000 };

                return;
            }
        }

        if (!this.device?.pinhole) {
            return;
        }

        if (same?.method === "upnp" && this.method === "upnp") {
            const kept = await this.device.keepPinhole({ id: same.id, lifetime }).then(
                () => true,
                () => false,
            );

            if (kept) {
                this.pinhole = { ...same, until: this.clock() + lifetime * 1000 };

                return;
            }
        }

        const { id } = await this.device.pinhole({ address: v6, port, lifetime });

        this.pinhole = { method: "upnp", address: v6, port, id, until: this.clock() + lifetime * 1000 };
    }

    // A pinhole let go, by the method that made it
    async #unpinhole(pinhole, device) {
        if (pinhole?.method === "pcp") {
            await pinhole.device.unmap({ internalPort: pinhole.port, nonce: pinhole.nonce, internal: pinhole.address }).catch(() => {});
        } else if (pinhole?.method === "upnp") {
            await device?.unpinhole?.({ id: pinhole.id }).catch(() => {});
        }
    }

    // Renewed at half the shortest lifetime (a mapping that doesn't run out isn't)
    #renewLater() {
        const lives = [...this.mappings.map((one) => one.lifetime), this.pinhole ? ROUTER_TIMES.lifetime : 0].filter((life) => life > 0);

        if (!lives.length) {
            return;
        }

        this.timer = setTimeout(() => this.on && this.#start(), (Math.min(...lives) * 1000) / 2);
        this.timer.unref?.();
    }

    #failed(error) {
        const wait = ROUTER_TIMES.retry[Math.min(this.tries, ROUTER_TIMES.retry.length - 1)];

        this.tries++;
        this.error = { message: error.message, at: new Date(this.clock()).toISOString() };
        this.retryAt = this.clock() + wait;
        this.timer = setTimeout(() => this.on && this.#start(), wait);
        this.timer.unref?.();

        return this.state();
    }

    // Mappings let go, by the method that made them (as best it can: the router may be gone)
    async #unmap(mappings, { method, device }) {
        for (const mapping of mappings) {
            if (method === "upnp") {
                await device?.unmap({ externalPort: mapping.external }).catch(() => {});
            } else {
                await device?.unmap({ internalPort: mapping.internal, nonce: mapping.nonce }).catch(() => {});
            }
        }
    }

    /**
     * How far it got: how the internet sees this home (STUN), whether a provider shares its
     * address, and whether the server reaches itself by its public address. Returns state().
     */
    async check() {
        const seen = await publicAddress({ servers: this.stunServers, tries: this.waits.tries, first: this.waits.first }).catch(() => null);
        const mapping = this.mappings[0];

        this.seen = seen?.address ?? null;
        this.sharing = sharingOf(this.external, this.seen);
        this.hairpin = mapping && this.external && !this.sharing ? await this.server.hairpin(this.reach(this.external), mapping.external, ROUTER_TIMES.hairpin).catch(() => false) : null;
        this.checkedAt = this.clock();

        return this.state();
    }

    /** Stopped: the mappings and pinhole let go (the server's stopping, or the internet's no longer answered). */
    async close() {
        clearTimeout(this.timer);
        await this.working?.catch(() => {});

        const { method, device, mappings, pinhole } = this;

        this.reset();
        await this.#unmap(mappings, { method, device });
        await this.#unpinhole(pinhole, device);

        return this.state();
    }
}
