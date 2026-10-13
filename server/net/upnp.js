// UPnP-IGD, the Internet Gateway Device (generated/world_server_plan.md §9.3): asked last, after
// PCP and NAT-PMP, since most home routers speak it but it's the loosest of the three. The router's
// found by SSDP (an M-SEARCH sent to 239.255.255.250:1900; it answers with where its description
// is), its description read for its WAN connection's service (WANIPConnection v2 or v1, or
// WANPPPConnection) and, on IGD v2, its IPv6 firewall's (WANIPv6FirewallControl); then each asked
// by SOAP: its public address, a port forwarded (AddPortMapping, or AddAnyPortMapping where the
// port's taken), let go (DeletePortMapping); a pinhole opened (AddPinhole), kept (UpdatePinhole) or
// closed (DeletePinhole).
//
// Only a description at a home address is believed (any machine on the Wi-Fi may answer SSDP),
// and the gateway's own is preferred.

import dgram from "node:dgram";
import { isHome } from "../access/addresses.js";

/** Where SSDP's searches go. */
export const SSDP = Object.freeze({ address: "239.255.255.250", port: 1900 });

/** What's searched for: an Internet Gateway Device, v2 or v1. */
export const IGD_TYPES = Object.freeze(["urn:schemas-upnp-org:device:InternetGatewayDevice:2", "urn:schemas-upnp-org:device:InternetGatewayDevice:1"]);

/** The services a port is forwarded by, best first; and an IPv6 firewall's. */
export const WAN_SERVICES = Object.freeze(["urn:schemas-upnp-org:service:WANIPConnection:2", "urn:schemas-upnp-org:service:WANIPConnection:1", "urn:schemas-upnp-org:service:WANPPPConnection:1"]);
export const FIREWALL_SERVICE = "urn:schemas-upnp-org:service:WANIPv6FirewallControl:1";

/** How long it waits for SSDP's answers, and for a SOAP call (ms). */
export const UPNP_LIMITS = Object.freeze({ search: 2000, call: 5000 });

/** What UPnP error codes mean (the IGD specifications). */
export const UPNP_ERRORS = Object.freeze({
    606: "isn't allowed (UPnP may be turned off for changes in its settings)",
    714: "has no such forwarding",
    715: "doesn't take a wildcard for the remote address",
    716: "doesn't take a wildcard for the external port",
    718: "already forwards that port to another computer",
    724: "needs the same port inside and out",
    725: "only takes forwarding that doesn't run out",
    728: "has no room for more forwarding",
    729: "won't forward that port",
});

/** A router's UPnP refusal. */
export class UpnpError extends Error {
    constructor(code, description = "") {
        super(`The router ${UPNP_ERRORS[code] ?? `refused (UPnP error ${code}${description ? `: ${description}` : ""})`}.`);
        this.code = code;
    }
}

/**
 * Where Internet Gateway Devices describe themselves: the LOCATIONs SSDP's answers give, within
 * `within` ms, at home addresses alone (`target` for the tests).
 */
export function search({ target = SSDP, within = UPNP_LIMITS.search, types = IGD_TYPES } = {}) {
    return new Promise((resolve) => {
        const socket = dgram.createSocket("udp4");
        const found = new Set();

        socket.on("error", () => {
            socket.close();
            resolve([]);
        });
        socket.on("message", (reply) => {
            const location = /^location:\s*(\S+)/im.exec(reply.toString("utf8"))?.[1];
            const host = location ? URL.canParse(location) && new URL(location).hostname.replace(/^\[|\]$/g, "") : null;

            if (host && isHome(host)) {
                found.add(location);
            }
        });
        socket.bind(0, () => {
            for (const type of types) {
                const message = Buffer.from(`M-SEARCH * HTTP/1.1\r\nHOST: ${SSDP.address}:${SSDP.port}\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ${type}\r\n\r\n`);

                socket.send(message, target.port, target.address);
            }

            setTimeout(() => {
                socket.close();
                resolve([...found]);
            }, within);
        });
    });
}

// What XML says between <name> and </name>, unescaped (the first, or every one)
const unescape = (text) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const tagOf = (xml, name) => {
    const found = new RegExp(`<(?:\\w+:)?${name}>([^<]*)</(?:\\w+:)?${name}>`).exec(xml);

    return found ? unescape(found[1].trim()) : null;
};
const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** A device description's services: [{ type, control (its control URL, absolute) }]. */
export function servicesOf(xml, location) {
    const base = tagOf(xml, "URLBase") ?? location;

    return [...xml.matchAll(/<service>([\s\S]*?)<\/service>/g)]
        .map(([, service]) => ({ type: tagOf(service, "serviceType"), control: tagOf(service, "controlURL") }))
        .filter(({ type, control }) => type && control && URL.canParse(control, base))
        .map(({ type, control }) => ({ type, control: new URL(control, base).href }));
}

/**
 * A SOAP call: `action` of `service` at `control`, with `args` in order. Returns the answer's
 * XML; refused with UpnpError (its error code) if the router refuses.
 */
export async function soap({ fetch = globalThis.fetch, control, service, action, args = {} }) {
    const body = `<?xml version="1.0"?>\r\n<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${action} xmlns:u="${service}">${Object.entries(args)
        .map(([name, value]) => `<${name}>${escape(value)}</${name}>`)
        .join("")}</u:${action}></s:Body></s:Envelope>`;
    let response;

    try {
        response = await fetch(control, { method: "POST", headers: { "Content-Type": 'text/xml; charset="utf-8"', SOAPAction: `"${service}#${action}"` }, body, signal: AbortSignal.timeout(UPNP_LIMITS.call) });
    } catch (error) {
        throw new UpnpError(0, `it couldn't be reached (${error.cause?.code ?? error.message})`);
    }

    const text = await response.text();

    if (!response.ok) {
        throw new UpnpError(Number(tagOf(text, "errorCode")) || response.status, tagOf(text, "errorDescription") ?? "");
    }

    return text;
}

/**
 * The Internet Gateway Device described at `location`: its WAN connection's service (and its IPv6
 * firewall's, if it has one), asked as `client` (this computer's LAN address). Null if it has no
 * WAN connection service. Returns { kind, version, externalAddress(), map(), unmap(), pinhole?,
 * unpinhole?, keepPinhole? }.
 */
export async function upnp({ location, client, fetch = globalThis.fetch, description = "Pellagos" }) {
    const response = await fetch(location, { signal: AbortSignal.timeout(UPNP_LIMITS.call) });

    if (!response.ok) {
        return null;
    }

    const services = servicesOf(await response.text(), location);
    const wan = WAN_SERVICES.map((type) => services.find((service) => service.type === type)).find(Boolean);
    const firewall = services.find((service) => service.type === FIREWALL_SERVICE);

    if (!wan) {
        return null;
    }

    const call = (service, action, args) => soap({ fetch, control: service.control, service: service.type, action, args });
    const version = wan.type.endsWith(":2") ? 2 : 1;
    const mappingArgs = ({ internalPort, externalPort, lifetime }) => ({
        NewRemoteHost: "",
        NewExternalPort: externalPort,
        NewProtocol: "TCP",
        NewInternalPort: internalPort,
        NewInternalClient: client,
        NewEnabled: 1,
        NewPortMappingDescription: description,
        NewLeaseDuration: lifetime,
    });

    const device = {
        kind: "upnp",
        version,
        location,

        /** The router's public address: { address }. */
        async externalAddress() {
            return { address: tagOf(await call(wan, "GetExternalIPAddress", {}), "NewExternalIPAddress") };
        },

        /**
         * A port forwarded for `lifetime` seconds: { internalPort, externalPort, lifetime }. A router
         * that takes only forwarding that doesn't run out (725) is asked for that (lifetime 0); one
         * whose port's taken is asked, on IGD v2, for any port it'll give (AddAnyPortMapping).
         */
        async map({ internalPort, externalPort = internalPort, lifetime = 7200 }) {
            try {
                await call(wan, "AddPortMapping", mappingArgs({ internalPort, externalPort, lifetime }));

                return { internalPort, externalPort, lifetime };
            } catch (error) {
                if (error.code === 725 && lifetime) {
                    return device.map({ internalPort, externalPort, lifetime: 0 });
                }

                if (error.code === 718 && version === 2) {
                    const answer = await call(wan, "AddAnyPortMapping", mappingArgs({ internalPort, externalPort, lifetime }));

                    return { internalPort, externalPort: Number(tagOf(answer, "NewReservedPort")) || externalPort, lifetime };
                }

                throw error;
            }
        },

        /** A mapping let go. */
        async unmap({ externalPort }) {
            await call(wan, "DeletePortMapping", { NewRemoteHost: "", NewExternalPort: externalPort, NewProtocol: "TCP" });
        },
    };

    if (firewall) {
        Object.assign(device, {
            /** A pinhole through the IPv6 firewall to `address`:`port`, from anywhere, for `lifetime` seconds. Returns { id }. */
            async pinhole({ address, port, lifetime = 7200 }) {
                const answer = await call(firewall, "AddPinhole", { RemoteHost: "", RemotePort: 0, InternalClient: address, InternalPort: port, Protocol: 6, LeaseTime: lifetime });

                return { id: tagOf(answer, "UniqueID") };
            },
            async keepPinhole({ id, lifetime = 7200 }) {
                await call(firewall, "UpdatePinhole", { UniqueID: id, NewLeaseTime: lifetime });
            },
            async unpinhole({ id }) {
                await call(firewall, "DeletePinhole", { UniqueID: id });
            },
        });
    }

    return device;
}
