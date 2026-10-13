// A home router for the tests, on loopback (generated/world_server_plan.md §9.3), speaking what
// real ones do: PCP (RFC 6887) and NAT-PMP (RFC 6886) on one UDP port, as a router that speaks
// PCP answers both; UPnP-IGD's SSDP (answered by unicast to whoever searched) and its description
// and SOAP control over HTTP, with an IPv6 firewall on IGD v2; and STUN (RFC 8489) on another UDP
// port. Each is turned on or off (`speaks`), keeps the mappings and pinholes it's asked for, and
// can refuse (`refuse`), so each of the server's fallbacks can be seen working.

import dgram from "node:dgram";
import http from "node:http";
import { addressOf, bytesOf } from "../server/net/udp.js";

const COOKIE = 0x2112a442;

export class FakeRouter {
    /**
     * @param {object} options
     * @param {Set<string>|string[]} [options.speaks] - What it answers: "pcp", "natpmp", "upnp", "upnp1" (IGD v1, no IPv6 firewall), "stun".
     * @param {string} [options.external] - Its public IPv4 address.
     * @param {string} [options.seen] - The address STUN says the internet sees (another, behind a provider's NAT).
     * @param {object} [options.refuse] - Refusals: { pcp: result code, natpmp: result code, upnp: error code }.
     */
    constructor({ speaks = ["pcp", "natpmp", "upnp", "stun"], external = "203.0.113.9", seen = null, refuse = {} } = {}) {
        Object.assign(this, { speaks: new Set(speaks), external, seen: seen ?? external, refuse });
        this.mappings = new Map();
        this.pinholes = new Map();
        this.asked = [];
        this.epoch = 1000;
    }

    async start() {
        this.udp = await this.#udp((message, from) => this.#protocol(message, from));
        this.stun = await this.#udp((message, from) => this.#stun(message, from));
        this.ssdp = await this.#udp((message, from) => this.#ssdp(message, from));
        this.http = http.createServer((request, response) => this.#http(request, response));
        await new Promise((resolve) => this.http.listen(0, "127.0.0.1", resolve));
        this.port = this.udp.address().port;
        this.stunPort = this.stun.address().port;
        this.ssdpPort = this.ssdp.address().port;
        this.base = `http://127.0.0.1:${this.http.address().port}`;

        return this;
    }

    close() {
        for (const socket of [this.udp, this.stun, this.ssdp]) {
            socket?.close();
        }

        this.http?.closeAllConnections();
        this.http?.close();
    }

    async #udp(handle) {
        const socket = dgram.createSocket("udp4");

        socket.on("message", (message, from) => {
            const reply = handle(message, from);

            if (reply) {
                socket.send(reply, from.port, from.address);
            }
        });
        await new Promise((resolve) => socket.bind(0, "127.0.0.1", resolve));

        return socket;
    }

    // PCP and NAT-PMP, told apart by their first byte (the version)
    #protocol(message, from) {
        if (message[0] === 2) {
            this.asked.push("pcp");

            if (!this.speaks.has("pcp")) {
                // (A NAT-PMP router: "unsupported version", in NAT-PMP's form)
                return this.speaks.has("natpmp") ? Buffer.from([0, 128 + message[1], 0, 1, 0, 0, 0, 0]) : null;
            }

            return this.#pcp(message, from);
        }

        if (message[0] === 0) {
            this.asked.push("natpmp");

            return this.speaks.has("natpmp") ? this.#natpmp(message) : null;
        }

        return null;
    }

    #pcp(message) {
        const reply = Buffer.alloc(60);
        const lifetime = message.readUInt32BE(4);
        const nonce = message.subarray(24, 36);
        const internal = addressOf(message.subarray(8, 24));
        const internalPort = message.readUInt16BE(40);
        const wanted = message.readUInt16BE(42);
        const key = `pcp ${internal} ${internalPort}`;
        const had = this.mappings.get(key) ?? this.pinholes.get(key);

        reply[0] = 2;
        reply[1] = 0x80 | 1;
        reply.writeUInt32BE(this.epoch, 8);
        message.copy(reply, 24, 24, 60);

        if (had && !had.nonce.equals(nonce)) {
            reply[3] = 2;

            return reply;
        }

        if (this.refuse.pcp) {
            reply[3] = this.refuse.pcp;

            return reply;
        }

        if (!lifetime) {
            this.mappings.delete(key);
            this.pinholes.delete(key);
        } else if (internal.includes(":")) {
            this.pinholes.set(key, { internal, internalPort, lifetime, nonce: Buffer.from(nonce), by: "pcp" });
        } else {
            this.mappings.set(key, { internal, internalPort, external: wanted || internalPort, lifetime, nonce: Buffer.from(nonce), by: "pcp" });
        }

        reply.writeUInt32BE(lifetime, 4);
        reply.writeUInt16BE(lifetime ? wanted || internalPort : 0, 42);
        bytesOf(internal.includes(":") ? internal : this.external).copy(reply, 44);

        return reply;
    }

    #natpmp(message) {
        const opcode = message[1];

        if (opcode === 0) {
            const reply = Buffer.alloc(12);

            reply[1] = 128;
            reply.writeUInt32BE(this.epoch, 4);
            bytesOf(this.external).copy(reply, 8, 12, 16);

            return reply;
        }

        const reply = Buffer.alloc(16);
        const internalPort = message.readUInt16BE(4);
        const wanted = message.readUInt16BE(6);
        const lifetime = message.readUInt32BE(8);
        const key = `natpmp ${internalPort}`;

        reply[1] = 128 + opcode;
        reply.writeUInt32BE(this.epoch, 4);
        reply.writeUInt16BE(internalPort, 8);

        if (this.refuse.natpmp) {
            reply.writeUInt16BE(this.refuse.natpmp, 2);

            return reply;
        }

        if (lifetime) {
            this.mappings.set(key, { internalPort, external: wanted, lifetime, by: "natpmp" });
        } else {
            this.mappings.delete(key);
        }

        reply.writeUInt16BE(lifetime ? wanted : 0, 10);
        reply.writeUInt32BE(lifetime, 12);

        return reply;
    }

    #stun(message) {
        if (!this.speaks.has("stun") || message.length < 20 || message.readUInt16BE(0) !== 1) {
            return null;
        }

        const reply = Buffer.alloc(32);
        const port = 40000;

        reply.writeUInt16BE(0x0101, 0);
        reply.writeUInt16BE(12, 2);
        message.copy(reply, 4, 4, 20);
        reply.writeUInt16BE(0x0020, 20);
        reply.writeUInt16BE(8, 22);
        reply[25] = 1;
        reply.writeUInt16BE(port ^ (COOKIE >>> 16), 26);
        reply.writeUInt32BE((this.seen.split(".").reduce((value, part) => (value << 8) | Number(part), 0) ^ COOKIE) >>> 0, 28);

        return reply;
    }

    #ssdp(message) {
        const text = message.toString("utf8");

        if (!this.speaks.has("upnp") && !this.speaks.has("upnp1")) {
            return null;
        }

        if (!text.startsWith("M-SEARCH") || !/ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1/.test(text)) {
            return null;
        }

        this.asked.push("ssdp");

        return Buffer.from(`HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=120\r\nST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\nUSN: uuid:fake::urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\nLOCATION: ${this.base}/rootDesc.xml\r\n\r\n`);
    }

    async #http(request, response) {
        const parts = [];

        for await (const part of request) {
            parts.push(part);
        }

        const body = Buffer.concat(parts).toString("utf8");
        const v2 = this.speaks.has("upnp");
        const wan = v2 ? "urn:schemas-upnp-org:service:WANIPConnection:2" : "urn:schemas-upnp-org:service:WANIPConnection:1";

        if (request.url === "/rootDesc.xml") {
            response.writeHead(200, { "Content-Type": "text/xml" });
            response.end(`<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:${v2 ? 2 : 1}</deviceType><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANDevice:1</deviceType><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:1</deviceType><serviceList><service><serviceType>${wan}</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId><controlURL>/ctl/IPConn</controlURL></service>${v2 ? `<service><serviceType>urn:schemas-upnp-org:service:WANIPv6FirewallControl:1</serviceType><serviceId>urn:upnp-org:serviceId:WANIPv6Firewall1</serviceId><controlURL>/ctl/IP6FCtl</controlURL></service>` : ""}</serviceList></device></deviceList></device></deviceList></device></root>`);

            return;
        }

        const action = /#(\w+)"?$/.exec(request.headers.soapaction ?? "")?.[1];
        const arg = (name) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? null;
        const fault = (code) => {
            response.writeHead(500, { "Content-Type": "text/xml" });
            response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>Refused</errorDescription></UPnPError></detail></s:Fault></s:Body></s:Envelope>`);
        };
        const ok = (inner = "") => {
            response.writeHead(200, { "Content-Type": "text/xml" });
            response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:${action}Response xmlns:u="${wan}">${inner}</u:${action}Response></s:Body></s:Envelope>`);
        };

        this.asked.push(`upnp ${action}`);

        if (action === "GetExternalIPAddress") {
            ok(`<NewExternalIPAddress>${this.external}</NewExternalIPAddress>`);
        } else if (action === "AddPortMapping") {
            if (this.refuse.upnp) {
                fault(this.refuse.upnp);
            } else if (this.refuse.permanentOnly && arg("NewLeaseDuration") !== "0") {
                fault(725);
            } else {
                this.mappings.set(`upnp ${arg("NewExternalPort")}`, { internal: arg("NewInternalClient"), internalPort: Number(arg("NewInternalPort")), external: Number(arg("NewExternalPort")), lifetime: Number(arg("NewLeaseDuration")), by: "upnp" });
                ok();
            }
        } else if (action === "DeletePortMapping") {
            this.mappings.delete(`upnp ${arg("NewExternalPort")}`);
            ok();
        } else if (action === "AddPinhole") {
            const id = String(this.pinholes.size + 1);

            this.pinholes.set(`upnp ${id}`, { internal: arg("InternalClient"), internalPort: Number(arg("InternalPort")), lifetime: Number(arg("LeaseTime")), by: "upnp" });
            ok(`<UniqueID>${id}</UniqueID>`);
        } else if (action === "UpdatePinhole") {
            ok();
        } else if (action === "DeletePinhole") {
            this.pinholes.delete(`upnp ${arg("UniqueID")}`);
            ok();
        } else {
            fault(401);
        }
    }
}
