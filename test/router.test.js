// The home's router asked to let the internet in (generated/world_server_plan.md §9.3, §15 S6c),
// against a router of the tests' own on loopback (test/fake-router.js): PCP asked first, NAT-PMP
// when the router doesn't speak it, UPnP-IGD when it speaks neither; the play port forwarded the
// same outside, and the internet's 443 to the server's second port while its certificate's for the
// IP address; renewed by the same PCP nonce; an IPv6 pinhole; let go when the internet's no longer
// answered or the server stops. How far it got: the public address by STUN, a provider's sharing
// (CGNAT) told apart, the server reaching itself by its public address; and, when the router
// won't, how to forward the port by hand. The protocols' bytes, and the platform's gateway, too.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { ADMIN_HEADER, ADMIN_VALUE } from "../server/admin.js";
import { natpmp, NatPmpError } from "../server/net/natpmp.js";
import { pcp, PcpError, PcpUnsupported } from "../server/net/pcp.js";
import { bindingRequest, mappedAddressOf, stun } from "../server/net/stun.js";
import { addressOf, bytesOf } from "../server/net/udp.js";
import { servicesOf, UpnpError } from "../server/net/upnp.js";
import { routeGateway } from "../server/platform/darwin.js";
import { routeTable, routeTable6 } from "../server/platform/linux.js";
import { sharingOf } from "../server/router.js";
import { WorldServer } from "../server/world-server.js";
import { FakeRouter } from "./fake-router.js";

// Short codes hashed cheaply in the tests
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const made = [];
const servers = [];
const routers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    routers.forEach((router) => router.close());
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 20000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

async function fakeRouter(options) {
    const router = await new FakeRouter(options).start();

    routers.push(router);

    return router;
}

// A world server on loopback answering the internet, its router the fake one (and its public
// address reached at loopback, as the router would hairpin it)
async function serve(fake, { v6 = null, gateway6 = null, settings = {} } = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-router-"));

    made.push(root);

    const server = await WorldServer.open(root, {
        cost: CHEAP,
        awake: () => ({ stop() {} }),
        router: { gateways: async () => ({ v4: "127.0.0.1", v6: gateway6 }), lan: "127.0.0.1", v6, port: fake.port, ssdp: { address: "127.0.0.1", port: fake.ssdpPort }, stun: [{ host: "127.0.0.1", port: fake.stunPort }], reach: () => "127.0.0.1", quick: true },
    });

    servers.push(server);
    await server.settings.change({ setAsideMinutes: 0, internet: true, ...settings });
    await server.listen(0, "127.0.0.1");
    await server.listenAdmin(0);

    return server;
}

const settled = (server) => until(() => !server.router.working && (server.router.method || server.router.error), "the router asked");

// A call to the management page's own listener, as the page makes it
async function manageCall(server, method, route, body = null) {
    const text = body ? JSON.stringify(body) : null;
    const ask = (options) =>
        new Promise((resolve, reject) => {
            const request = http.request({ host: "127.0.0.1", port: server.adminPort, ...options }, (response) => {
                const parts = [];

                response.on("data", (part) => parts.push(part));
                response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(parts).toString("utf8") }));
            });

            request.on("error", reject);
            request.end(options.body);
        });
    const page = await ask({ path: "/", headers: { Host: `localhost:${server.adminPort}` } });
    const cookie = page.headers["set-cookie"][0].split(";")[0];
    const answer = await ask({ method, path: `/api/v1${route}`, headers: { Host: `localhost:${server.adminPort}`, Cookie: cookie, [ADMIN_HEADER]: ADMIN_VALUE, ...(text ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) } : {}) }, body: text ?? undefined });

    return { status: answer.status, json: JSON.parse(answer.text) };
}

describe("the protocols' bytes (net/udp.js, natpmp.js, pcp.js, stun.js, upnp.js) and the platform's gateway", () => {
    it("writes addresses as 16 bytes (IPv4 in its IPv6-mapped form) and back, shortened as RFC 5952 has it", () => {
        assert.equal(bytesOf("192.168.1.20").toString("hex"), "00000000000000000000ffffc0a80114");
        assert.equal(bytesOf("2001:db8::1").toString("hex"), "20010db8000000000000000000000001");
        assert.equal(addressOf(bytesOf("::ffff:10.0.0.1")), "10.0.0.1");
        assert.equal(addressOf(bytesOf("fe80::1%en0")), "fe80::1");
        assert.equal(addressOf(bytesOf("2001:db8:0:0:1::2")), "2001:db8::1:0:0:2");
        assert.equal(addressOf(Buffer.alloc(16)), "::");
        assert.throws(() => bytesOf("router.local"), /isn't an IP address/);
    });

    it("reads STUN's XOR-MAPPED-ADDRESS, IPv4 and IPv6 (RFC 8489 §14.2), and MAPPED-ADDRESS where that's all there is", () => {
        const id = Buffer.from("0123456789ab");
        const request = bindingRequest(id);

        assert.equal(request.readUInt16BE(0), 1);
        assert.equal(request.readUInt32BE(4), 0x2112a442);
        assert.deepEqual(request.subarray(8), id);

        // (IPv6: the address XORed with the cookie and the transaction id)
        const mask = Buffer.concat([Buffer.from([0x21, 0x12, 0xa4, 0x42]), id]);
        const address = bytesOf("2001:db8::7");
        const xored = Buffer.from(address.map((byte, at) => byte ^ mask[at]));
        const response = Buffer.concat([Buffer.from([0x01, 0x01, 0, 24, 0x21, 0x12, 0xa4, 0x42]), id, Buffer.from([0x00, 0x20, 0, 20, 0, 2]), Buffer.from([(8480 ^ 0x2112) >> 8, (8480 ^ 0x2112) & 0xff]), xored]);

        assert.deepEqual(mappedAddressOf(response), { address: "2001:db8::7", port: 8480 });

        const plain = Buffer.concat([Buffer.from([0x01, 0x01, 0, 12, 0x21, 0x12, 0xa4, 0x42]), id, Buffer.from([0x00, 0x01, 0, 8, 0, 1, 0x21, 0x20, 198, 51, 100, 4])]);

        assert.deepEqual(mappedAddressOf(plain), { address: "198.51.100.4", port: 8480 });
    });

    it("says a router's refusals in words", () => {
        assert.equal(new NatPmpError(2).message, "The router refused (forwarding may be turned off in its settings).");
        assert.equal(new PcpError(8).message, "The router has no room for more forwarding.");
        assert.equal(new PcpError(12).message, "The router sees this computer by another address (another router may be between them).");
        assert.equal(new UpnpError(718).message, "The router already forwards that port to another computer.");
        assert.equal(new UpnpError(501, "Action Failed").message, "The router refused (UPnP error 501: Action Failed).");
    });

    it("reads a UPnP device's services, its control URLs made whole from its base", () => {
        const xml = `<root><URLBase>http://192.168.1.1:5000/</URLBase><device><serviceList><service><serviceType>urn:schemas-upnp-org:service:WANIPConnection:1</serviceType><controlURL>/ctl/IPConn</controlURL></service><service><serviceType>urn:schemas-upnp-org:service:Layer3Forwarding:1</serviceType><controlURL>ctl/L3F</controlURL></service></serviceList></device></root>`;

        assert.deepEqual(servicesOf(xml, "http://192.168.1.1:5000/rootDesc.xml"), [
            { type: "urn:schemas-upnp-org:service:WANIPConnection:1", control: "http://192.168.1.1:5000/ctl/IPConn" },
            { type: "urn:schemas-upnp-org:service:Layer3Forwarding:1", control: "http://192.168.1.1:5000/ctl/L3F" },
        ]);
    });

    it("finds the default gateway as macOS's route and Linux's routing tables say it", () => {
        assert.equal(routeGateway("   route to: default\ndestination: default\n       mask: default\n    gateway: 192.168.1.1\n  interface: en0\n"), "192.168.1.1");
        assert.equal(routeGateway("    gateway: fe80::1%en0\n"), "fe80::1%en0");
        assert.equal(routeGateway("route: writing to routing socket: not in table\n"), null);

        const table = "Iface\tDestination\tGateway \tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\nwlan0\t00000000\t0102A8C0\t0003\t0\t0\t600\t00000000\t0\t0\t0\neth0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\neth0\t0001A8C0\t00000000\t0001\t0\t0\t100\t00FFFFFF\t0\t0\t0\n";

        assert.equal(routeTable(table), "192.168.1.1", "the lowest metric");
        assert.equal(routeTable("Iface\tDestination\tGateway\n"), null);
        assert.equal(routeTable6("00000000000000000000000000000000 00 00000000000000000000000000000000 00 fe800000000000000000000000000001 00000400 00000001 00000000 00000003 eth0\n"), "fe80::1%eth0");
        assert.equal(routeTable6("00000000000000000000000000000000 00 00000000000000000000000000000000 00 20010db8000000010000000000000001 00000400 00000001 00000000 00000003 eth0\n"), "2001:db8:0:1::1");
    });

    it("tells a provider's sharing from the router's public address and the one the internet sees", () => {
        assert.equal(sharingOf("100.72.1.2", "198.51.100.4"), "carrier");
        assert.equal(sharingOf("192.168.0.2", "198.51.100.4"), "double");
        assert.equal(sharingOf("203.0.113.9", "198.51.100.4"), "beyond");
        assert.equal(sharingOf("203.0.113.9", "203.0.113.9"), null);
        assert.equal(sharingOf("203.0.113.9", null), null);
        assert.equal(sharingOf(null, "203.0.113.9"), null);
    });

    it("asks PCP, renewing by the same nonce; a NAT-PMP router answering PCP is told apart; and STUN", async () => {
        const fake = await fakeRouter({ seen: "198.51.100.4" });
        const client = pcp({ gateway: "127.0.0.1", client: "127.0.0.1", port: fake.port, tries: 2, first: 50 });
        const made_ = await client.map({ internalPort: 8480 });

        assert.equal(made_.externalPort, 8480);
        assert.equal(made_.externalAddress, "203.0.113.9");
        assert.equal(made_.lifetime, 7200);
        assert.equal((await client.map({ internalPort: 8480, nonce: made_.nonce })).externalPort, 8480);
        await assert.rejects(client.map({ internalPort: 8480 }), (error) => error instanceof PcpError && error.code === 2, "another nonce for the same port: refused");
        await client.unmap({ internalPort: 8480, nonce: made_.nonce });
        assert.equal(fake.mappings.size, 0);

        const old = await fakeRouter({ speaks: ["natpmp"] });

        await assert.rejects(pcp({ gateway: "127.0.0.1", client: "127.0.0.1", port: old.port, tries: 2, first: 50 }).map({ internalPort: 8480 }), PcpUnsupported);

        const asked = natpmp({ gateway: "127.0.0.1", port: old.port, tries: 2, first: 50 });

        assert.deepEqual(await asked.externalAddress(), { address: "203.0.113.9", epoch: 1000 });
        assert.deepEqual(await asked.map({ internalPort: 8480 }), { internalPort: 8480, externalPort: 8480, lifetime: 7200, epoch: 1000 });
        assert.deepEqual(await stun({ host: "127.0.0.1", port: fake.stunPort, first: 50 }), { address: "198.51.100.4", port: 40000 });
    });
});

describe("the router asked by the world server (router.js)", () => {
    it("by PCP first: the play port forwarded, the internet seen as the router says, and the server reaching itself", async () => {
        const fake = await fakeRouter();
        const server = await serve(fake);

        await settled(server);

        const state = server.router.state();

        assert.equal(state.method, "pcp");
        assert.deepEqual(
            state.mappings.map(({ internal, external, lifetime }) => ({ internal, external, lifetime })),
            [{ internal: server.port, external: server.port, lifetime: 7200 }],
        );
        assert.equal(state.external, "203.0.113.9");
        assert.equal(state.seen, "203.0.113.9");
        assert.equal(state.sharing, null);
        assert.equal(state.hairpin, true);
        assert.ok(fake.mappings.has(`pcp 127.0.0.1 ${server.port}`));

        const { json } = await manageCall(server, "GET", "/server");

        assert.match(json.overview.internet.router.words, new RegExp(`^The router \\(PCP\\) sends the internet's port ${server.port} to this computer, asked again as it runs out\\. Its public address is 203\\.0\\.113\\.9\\. The server reached itself by its public address: the port is open\\.$`));

        // (Asked again: the same mapping, renewed by its nonce, not refused as another's)
        const again = await manageCall(server, "POST", "/server/router");

        assert.equal(again.status, 200);
        assert.equal(again.json.internet.router.method, "pcp");
        assert.equal(server.router.state().error, null);

        // (The internet no longer answered: the mapping let go)
        await manageCall(server, "PATCH", "/server", { settings: { internet: false } });
        await until(() => fake.mappings.size === 0, "the mapping let go");
        assert.equal(server.router.state().on, false);
        assert.equal((await manageCall(server, "POST", "/server/router")).status, 409);
    });

    it("by NAT-PMP where the router doesn't speak PCP, and by UPnP where it speaks neither (v1, and one that takes only forwarding that doesn't run out)", async () => {
        const natpmpOnly = await fakeRouter({ speaks: ["natpmp", "stun"] });
        const one = await serve(natpmpOnly);

        await settled(one);
        assert.equal(one.router.method, "natpmp");
        assert.equal(one.router.external, "203.0.113.9");
        assert.ok(natpmpOnly.mappings.has(`natpmp ${one.port}`));

        const upnpOnly = await fakeRouter({ speaks: ["upnp1", "stun"], refuse: { permanentOnly: true } });
        const two = await serve(upnpOnly);

        await settled(two);
        assert.equal(two.router.method, "upnp");
        assert.deepEqual([...new Set(upnpOnly.asked)].slice(0, 3), ["pcp", "natpmp", "ssdp"], "PCP, then NAT-PMP, then UPnP");
        assert.equal(upnpOnly.mappings.get(`upnp ${two.port}`).lifetime, 0, "asked again for forwarding that doesn't run out");
        assert.equal(upnpOnly.mappings.get(`upnp ${two.port}`).internal, "127.0.0.1");
        assert.equal(two.router.timer, null, "nothing to renew");

        await two.close();
        assert.equal(upnpOnly.mappings.size, 0, "let go as the server stops");
    });

    it("says why when the router won't, how to forward the port by hand, and asks again later", async () => {
        const deaf = await fakeRouter({ speaks: ["stun"] });
        const server = await serve(deaf);

        await settled(server);

        const state = server.router.state();

        assert.equal(state.method, null);
        assert.match(state.error.message, /answered none of PCP, NAT-PMP or UPnP/);
        assert.ok(Date.parse(state.retryAt) - Date.now() > 50000);

        const { json } = await manageCall(server, "GET", "/server");

        assert.match(json.overview.internet.router.words, new RegExp(`Forward it by hand: in the router's settings \\(at http://127\\.0\\.0\\.1/\\), send TCP port ${server.port} to this computer \\(127\\.0\\.0\\.1\\), port ${server.port}\\.`));

        const refusing = await fakeRouter({ refuse: { pcp: 2, natpmp: 2, upnp: 606 } });
        const other = await serve(refusing);

        await settled(other);
        assert.match(other.router.state().error.message, /^PCP: The router refused \(forwarding may be turned off in its settings\)\. NAT-PMP: The router refused .* UPnP: The router isn't allowed/);

        // (Not to be asked: said, and the port to forward by hand)
        const off = await serve(await fakeRouter(), { settings: { router: false } });

        assert.equal(off.router.state().on, false);
        assert.match(off.manage.internet().router.words, /^The router isn't asked \(“Ask the router” is off in Settings\)\. Forward it by hand/);
    });

    it("sees a provider sharing its address (CGNAT), and doesn't try to reach itself then", async () => {
        const carrier = await fakeRouter({ external: "100.72.1.2", seen: "198.51.100.4" });
        const server = await serve(carrier);

        await settled(server);
        assert.equal(server.router.state().sharing, "carrier");
        assert.equal(server.router.state().hairpin, null);
        assert.match(server.manage.internet().router.words, /an address a provider shares between homes \(CGNAT\)/);

        const beyond = await fakeRouter({ external: "203.0.113.9", seen: "198.51.100.4" });
        const other = await serve(beyond);

        await settled(other);
        assert.equal(other.router.state().sharing, "beyond");
        assert.match(other.manage.internet().router.words, /the internet sees this home as 198\.51\.100\.4/);
    });

    it("opens the IPv6 firewall to this computer's own address, by PCP or UPnP", async () => {
        const fake = await fakeRouter();
        const server = await serve(fake, { v6: "2001:db8::7", gateway6: "127.0.0.1" });

        await settled(server);
        assert.deepEqual(server.router.state().pinhole, { address: "2001:db8::7", port: server.port, method: "pcp" });
        assert.ok(fake.pinholes.has(`pcp 2001:db8::7 ${server.port}`));
        assert.match(server.manage.internet().router.words, /Over IPv6, the router's firewall lets the internet in to 2001:db8::7\./);

        // (Renewed by the nonce it was made with, not refused as another's)
        await server.router.refresh();
        assert.equal(server.router.state().pinhole?.method, "pcp");

        await server.close();
        assert.equal(fake.pinholes.size, 0, "closed as the server stops");

        const upnpRouter = await fakeRouter({ speaks: ["upnp", "stun"] });
        const other = await serve(upnpRouter, { v6: "2001:db8::8" });

        await settled(other);
        assert.equal(other.router.state().pinhole.method, "upnp");
        assert.equal(upnpRouter.pinholes.get("upnp 1").internal, "2001:db8::8");

        // (Kept by its id, not opened again)
        await other.router.refresh();
        assert.ok(upnpRouter.asked.includes("upnp UpdatePinhole"));
        assert.equal(upnpRouter.pinholes.size, 1);
        assert.equal(other.router.state().pinhole.method, "upnp");
    });

    it("forwards the internet's 443 to the server's second port while its certificate's for the IP address", async () => {
        const fake = await fakeRouter();
        const server = await serve(fake);

        await settled(server);
        server.certifier.config = { route: "ip", names: ["203.0.113.9"] };
        await server.router.refresh();

        const second = await server.secondPort();
        const mappings = server.router.state().mappings;

        assert.notEqual(second, server.port);
        assert.deepEqual(
            mappings.map(({ internal, external }) => ({ internal, external })),
            [
                { internal: server.port, external: server.port },
                { internal: second, external: 443 },
            ],
        );
        assert.ok(fake.mappings.has(`pcp 127.0.0.1 ${second}`));
        assert.equal(await server.hairpin("127.0.0.1", second), true, "the second port answers as the first does");

        // (Its certificate's route changed: 443 let go)
        server.certifier.config = null;
        await server.router.refresh();
        assert.equal(fake.mappings.has(`pcp 127.0.0.1 ${second}`), false);
    });
});
