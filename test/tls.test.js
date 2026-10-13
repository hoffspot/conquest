// TLS on the one port (generated/world_server_plan.md §9.1, §13, S6), over real sockets: each
// connection handed on by its first byte, TLS to the https half and anything else to the plain
// half, even a byte at a time; home addresses take either; without a certificate TLS isn't
// answered at all; the internet (loopback made the internet here, as the `home` option lets the
// tests) is refused while it's closed, and once it's open is answered over TLS alone: plain API
// calls refused, page loads sent on to https, the play socket refused plain and taken over TLS,
// never the admin key nor the management page; turned off, or its certificate let go, whoever's
// in from there is sent out. A certificate's taken up without a restart.
import assert from "node:assert/strict";
import { X509Certificate } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { after, before, describe, it } from "node:test";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { newKey, pem, pemOfKey, selfSigned } from "../server/net/x509.js";
import { PLAY_PROTOCOL } from "../server/play.js";
import { CERT_FILE, CERTIFICATES, KEY_FILE } from "../server/storage/certificates.js";
import { WorldServer } from "../server/world-server.js";

// Short codes hashed cheaply in the tests (the server's own cost takes 128 MiB and a good part of a second)
const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });

const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 30000) {
    const end = Date.now() + ms;

    while (!test()) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(25);
    }
}

/** A key and a certificate signed by it, for `names` (the tests trust it as it is). */
function pair(names = ["localhost", "127.0.0.1", "pellagos.test"]) {
    const { privateKey } = newKey();

    return { key: pemOfKey(privateKey), cert: pem("CERTIFICATE", selfSigned({ key: privateKey, names, days: 7 })) };
}

// A world server on loopback; `internet` makes loopback the internet (no address is home)
async function serve({ internet = false, settings = {} } = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), "pellagos-tls-"));

    made.push(root);

    const server = await WorldServer.open(root, { cost: CHEAP, awake: () => ({ stop() {} }), ...(internet ? { home: () => false } : {}) });

    await server.settings.change({ setAsideMinutes: 0, ...settings });
    await server.listen(0, "127.0.0.1");
    servers.push(server);

    return server;
}

/**
 * An HTTP request on the port, plain or over TLS (`trust`: the certificate trusted; `name`: the
 * name asked for, as SNI and Host): { status, headers, json, peer (the certificate TLS answered
 * with) }.
 */
function ask(server, { secure = false, trust = null, name = "127.0.0.1", method = "GET", route = "/api/v1/status", headers = {}, body = null } = {}) {
    return new Promise((resolve, reject) => {
        const options = { host: "127.0.0.1", port: server.port, path: route, method, headers: { Host: `${name}:${server.port}`, ...headers }, agent: false };
        const made = (secure ? https : http).request(secure ? { ...options, servername: net.isIP(name) ? undefined : name, ca: trust } : options, (response) => {
            const parts = [];
            const peer = secure ? response.socket.getPeerX509Certificate?.() : null;

            response.on("data", (part) => parts.push(part));
            response.on("end", () => {
                const text = Buffer.concat(parts).toString("utf8");

                resolve({ status: response.statusCode, headers: response.headers, json: text.startsWith("{") ? JSON.parse(text) : text, peer });
            });
        });

        made.on("error", reject);
        made.end(body === null ? undefined : JSON.stringify(body));
    });
}

/**
 * The play socket, by hand (Node's own WebSocket can't be told which certificate to trust): the
 * upgrade asked for, plain or over TLS. Returns { status (the handshake's), lines (the server's
 * text frames), send(text), closed }.
 */
function playSocket(server, { secure = false, trust = null, name = "127.0.0.1" } = {}) {
    return new Promise((resolve, reject) => {
        const socket = secure ? tls.connect({ host: "127.0.0.1", port: server.port, ca: trust, servername: net.isIP(name) ? undefined : name }) : net.connect(server.port, "127.0.0.1");
        const game = { status: null, lines: [], closed: false };
        let buffered = Buffer.alloc(0);

        socket.on("error", reject);
        socket.on("close", () => {
            game.closed = true;
            resolve(game);
        });
        socket.once(secure ? "secureConnect" : "connect", () => {
            socket.write([`GET /play HTTP/1.1`, `Host: ${name}:${server.port}`, "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Version: 13", `Sec-WebSocket-Protocol: ${PLAY_PROTOCOL}`, "", ""].join("\r\n"));
        });
        socket.on("data", (chunk) => {
            buffered = Buffer.concat([buffered, chunk]);

            if (game.status === null) {
                const end = buffered.indexOf("\r\n\r\n");

                if (end < 0) {
                    return;
                }

                game.status = Number(/^HTTP\/1\.1 (\d{3})/.exec(buffered.subarray(0, end).toString("latin1"))?.[1]);
                buffered = buffered.subarray(end + 4);

                if (game.status !== 101) {
                    socket.destroy();

                    return;
                }

                // (A text frame from the game: masked, as RFC 6455 has a client's)
                game.send = (text) => {
                    const payload = Buffer.from(text, "utf8");
                    const mask = Buffer.from([1, 2, 3, 4]);
                    const head = payload.length < 126 ? Buffer.from([0x81, 0x80 | payload.length]) : Buffer.from([0x81, 0x80 | 126, payload.length >> 8, payload.length & 0xff]);

                    socket.write(Buffer.concat([head, mask, payload.map((byte, at) => byte ^ mask[at % 4])]));
                };
                game.socket = socket;
                resolve(game);
            }

            // (The server's frames: unmasked; text kept, the rest let be)
            while (buffered.length >= 2) {
                let length = buffered[1] & 0x7f;
                let at = 2;

                if (length === 126) {
                    length = buffered.readUInt16BE(2);
                    at = 4;
                } else if (length === 127) {
                    length = Number(buffered.readBigUInt64BE(2));
                    at = 10;
                }

                if (buffered.length < at + length) {
                    break;
                }

                if ((buffered[0] & 0x0f) === 1) {
                    game.lines.push(buffered.subarray(at, at + length).toString("utf8"));
                }

                buffered = buffered.subarray(at + length);
            }
        });
    });
}

describe("the one port, plain and TLS (server/world-server.js)", () => {
    let server;
    let certificate;

    before(async () => {
        server = await serve();
        certificate = pair();
    });

    it("hands each connection on by its first byte, even one that comes alone, and answers both halves alike", async () => {
        await server.useCertificate(certificate);

        const plain = await ask(server);
        const secure = await ask(server, { secure: true, trust: certificate.cert });
        const byName = await ask(server, { secure: true, trust: certificate.cert, name: "pellagos.test" });

        assert.equal(plain.status, 200);
        assert.equal(secure.status, 200);
        assert.equal(byName.status, 200, "its certificate's names are its own");
        assert.equal(secure.json.server.id, plain.json.server.id);
        assert.equal(secure.peer.fingerprint256, new X509Certificate(certificate.cert).fingerprint256);

        // (The first byte on its own, then the rest: plain, and a TLS handshake through a relay that splits it)
        const dribbled = await new Promise((resolve) => {
            const socket = net.connect(server.port, "127.0.0.1");
            const text = `GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1:${server.port}\r\nConnection: close\r\n\r\n`;
            let got = "";

            socket.on("data", (part) => (got += part));
            socket.on("close", () => resolve(got));
            socket.write(text.slice(0, 1));
            setTimeout(() => socket.write(text.slice(1)), 50);
        });

        assert.match(dribbled, /^HTTP\/1\.1 200[\s\S]*"health":"ok"/);

        const relay = net.createServer((client) => {
            const upstream = net.connect(server.port, "127.0.0.1");
            let first = true;

            client.on("data", (part) => {
                if (first) {
                    first = false;
                    upstream.write(part.subarray(0, 1));
                    setTimeout(() => upstream.write(part.subarray(1)), 50);
                } else {
                    upstream.write(part);
                }
            });
            upstream.on("data", (part) => client.write(part));
            upstream.on("close", () => client.destroy());
            client.on("close", () => upstream.destroy());
        });

        await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));

        const relayed = await ask({ port: relay.address().port }, { secure: true, trust: certificate.cert, route: "/api/v1/health", headers: { Host: `127.0.0.1:${server.port}` } });

        relay.close();
        assert.equal(relayed.status, 200);
    });

    it("takes the play socket from home plain or over TLS", async () => {
        for (const secure of [false, true]) {
            const game = await playSocket(server, { secure, trust: certificate.cert });

            assert.equal(game.status, 101, secure ? "wss" : "ws");
            game.send("hi abcdefghijklmnopqrstuv");
            await until(() => game.lines.some((line) => line.startsWith("hi ")), "the server's hi");
            game.socket.destroy();
        }
    });

    it("takes up a new certificate without a restart, and one put in its folder by hand; refuses one that can't be used", async () => {
        const next = pair(["localhost", "127.0.0.1"]);

        await server.useCertificate(next);
        assert.equal((await ask(server, { secure: true, trust: next.cert })).peer.fingerprint256, new X509Certificate(next.cert).fingerprint256);

        const byHand = pair(["127.0.0.1"]);

        await writeFile(path.join(server.root, CERTIFICATES, KEY_FILE), byHand.key);
        await writeFile(path.join(server.root, CERTIFICATES, CERT_FILE), byHand.cert);
        await server.loadCertificate();
        assert.equal((await ask(server, { secure: true, trust: byHand.cert })).peer.fingerprint256, new X509Certificate(byHand.cert).fingerprint256);
        assert.deepEqual(server.certificate.names, ["127.0.0.1"]);

        await assert.rejects(server.useCertificate({ key: pair().key, cert: next.cert }), /The key isn't the certificate's/);
        assert.deepEqual(server.certificate.names, ["127.0.0.1"], "the one it had kept");
    });

    it("answers no TLS at all without a certificate; plain still answers", async () => {
        await server.dropCertificate();
        assert.equal(server.certificate, null);
        await assert.rejects(ask(server, { secure: true, trust: certificate.cert }), (error) => ["ECONNRESET", "EPIPE"].includes(error.code) || /socket hang up|disconnected/i.test(error.message));
        assert.equal((await ask(server)).status, 200);
    });

    it("lets go a connection that says nothing, or stops partway, plain or over TLS, within its time limits", async () => {
        await server.useCertificate(certificate);

        const started = Date.now();
        // (Each read to its end, the server's 408 and all, so its close is seen)
        const watched = (socket) => new Promise((resolve) => {
            socket.on("error", () => {});
            socket.on("close", () => resolve(Date.now() - started));
            socket.resume();
        });
        const silent = net.connect(server.port, "127.0.0.1");
        const oneByte = net.connect(server.port, "127.0.0.1", () => oneByte.write("G"));
        const quiet = tls.connect({ host: "127.0.0.1", port: server.port, ca: certificate.cert });
        const halfway = tls.connect({ host: "127.0.0.1", port: server.port, ca: certificate.cert }, () => halfway.write("GET / HTTP/1.1\r\n"));
        const handshake = net.connect(server.port, "127.0.0.1", () => handshake.write(Buffer.from([0x16, 0x03, 0x01])));
        const times = await Promise.all([silent, oneByte, quiet, halfway, handshake].map(watched));

        for (const ms of times) {
            assert.ok(ms < 8000, `let go after ${ms} ms`);
        }
    });

    it("closes with TLS connections still open", async () => {
        const other = await serve();

        await other.useCertificate(certificate);

        const agent = new https.Agent({ keepAlive: true, ca: certificate.cert });

        await new Promise((resolve, reject) => https.get({ host: "127.0.0.1", port: other.port, path: "/api/v1/health", agent }, (response) => response.resume().on("end", resolve)).on("error", reject));

        const idle = await playSocket(other, { secure: true, trust: certificate.cert });
        const started = Date.now();

        await other.close();
        assert.ok(Date.now() - started < 5000, "closed at once");
        await until(() => idle.closed, "the open play socket closed");
        agent.destroy();
    });
});

describe("the internet (server/guards.js, world-server.js, over TLS alone)", () => {
    let server;
    let certificate;
    let world;

    before(async () => {
        server = await serve({ internet: true });
        certificate = pair();
        world = await server.createWorld({ name: "Farhold", race: "human", seed: 4 });
    });

    it("isn't answered while it's closed: the setting off, or no certificate", async () => {
        const off = await ask(server);

        assert.equal(off.status, 403);
        assert.equal(off.json.error, "internet");
        assert.match(off.json.message, /only its own Wi-Fi/);

        await server.manage.changeSettings({ internet: true });

        const unready = await ask(server);

        assert.equal(unready.json.error, "internet");
        assert.match(unready.json.message, /no certificate/);
        assert.match(server.manage.overview().internet.words, /no certificate yet/);

        // (A certificate, but the setting off: TLS is answered, the internet still refused)
        await server.manage.changeSettings({ internet: false });
        await server.useCertificate(certificate);
        assert.equal((await ask(server, { secure: true, trust: certificate.cert })).json.error, "internet");
        assert.match(server.manage.overview().internet.words, /off in Settings/);
    });

    it("once open, answers over TLS alone: plain calls refused, a page sent on to https, its secure addresses listed", async () => {
        await server.manage.changeSettings({ internet: true });

        const status = await ask(server, { secure: true, trust: certificate.cert, name: "pellagos.test" });

        assert.equal(status.status, 200);
        assert.ok(status.json.addresses.includes(`https://pellagos.test:${server.port}`));

        const plain = await ask(server);

        assert.equal(plain.status, 403);
        assert.equal(plain.json.error, "secure");
        assert.match(plain.json.message, new RegExp(`https://127\\.0\\.0\\.1:${server.port}`));

        const page = await ask(server, { name: "pellagos.test", route: "/index.html?x" });

        assert.equal(page.status, 308);
        assert.equal(page.headers.location, `https://pellagos.test:${server.port}/index.html?x`);
        assert.equal((await ask(server, { name: "evil.example", route: "/" })).status, 421, "never sent on to another site's name");
        assert.equal((await ask(server, { name: "pellagos.test", route: "http://evil.example/x?y" })).headers.location, `https://pellagos.test:${server.port}/x?y`, "the path alone kept, from a target written whole");
        assert.equal((await ask(server, { secure: true, trust: certificate.cert, route: "/" })).status, 200, "the game's page, over TLS");

        const { internet } = server.manage.overview();

        assert.equal(internet.open, true);
        assert.match(internet.words, /Answers the internet, over TLS alone/);
        assert.deepEqual(internet.certificate.names, ["localhost", "127.0.0.1", "pellagos.test"]);
    });

    it("never takes the admin key from there, nor shows the management page", async () => {
        const refused = await ask(server, { secure: true, trust: certificate.cert, route: "/api/v1/server", headers: { Authorization: `Key ${server.adminKey}`, "x-pellagos": "manage" } });

        assert.equal(refused.status, 403);
        assert.equal(refused.json.error, "home");
        assert.equal((await ask(server, { secure: true, trust: certificate.cert, route: "/admin" })).json.error, "home");
    });

    it("refuses the play socket plain, takes it over TLS, and sends out whoever's in from there when it's closed", async () => {
        assert.equal((await playSocket(server)).status, 403);

        const entered = await ask(server, { secure: true, trust: certificate.cert, method: "POST", route: "/api/v1/enter", headers: { "Content-Type": "application/json" }, body: { world: world.world, key: world.playerKey, net: NET_VERSION } });

        assert.equal(entered.status, 200);

        const game = await playSocket(server, { secure: true, trust: certificate.cert });

        assert.equal(game.status, 101);
        game.send(`enter ${world.world} ${entered.json.session}`);
        await until(() => game.lines.some((line) => line.startsWith("entered ") || line.startsWith("closed ")), "in");
        assert.ok(game.lines.some((line) => line.startsWith("entered ")), game.lines.join(" | "));
        assert.equal([...server.play.places.values()][0].from, "internet");

        // (Closed to the internet: sent out at once, saying why; and plain or TLS, refused from then on)
        await server.manage.changeSettings({ internet: false });
        await until(() => game.lines.includes("closed internet-closed"), "sent out");
        assert.equal(server.play.places.size, 0);
        assert.equal((await ask(server, { secure: true, trust: certificate.cert })).json.error, "internet");

        // (Opened again, then the certificate let go: closed again, and TLS no longer answered)
        await server.manage.changeSettings({ internet: true });
        assert.equal((await ask(server, { secure: true, trust: certificate.cert })).status, 200);
        await server.manage.dropCertificate();
        assert.equal((await ask(server)).json.error, "internet");
        await assert.rejects(ask(server, { secure: true, trust: certificate.cert }));
        assert.match(server.manage.overview().internet.words, /no certificate yet/);
    });
});
