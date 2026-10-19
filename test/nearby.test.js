// Nearby servers on the Wi-Fi (generated/world_server_plan.md §8.2, §15 S5), with a fake responder:
// each system's Bonjour tool read as it talks (dns-sd on macOS, avahi on Linux), refusals named
// for the owner, and the TXT record read back as it was written whatever's in the name; and world
// servers on a fake network finding each other (never themselves), listing the others in their
// status, losing them when they go, following their `bonjour` setting, and carrying on to serve
// players when Bonjour's refused, trying again later.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { after, describe, it } from "node:test";
import { NET_VERSION } from "../client/js/core/netplay.js";
import { refusal, REFUSALS } from "../server/platform/bonjour.js";
import { browseLine, dnsSdRefusal, reachedLine, txtLine } from "../server/platform/darwin.js";
import { avahiLine } from "../server/platform/linux.js";
import { bonjour, cardOfTxt, SERVICE, txtOf } from "../server/platform/index.js";
import { SERVER_VERSION } from "../server/storage/versions.js";
import { WorldServer } from "../server/world-server.js";
import { FakeNetwork } from "./fake-bonjour.js";

const CHEAP = Object.freeze({ N: 2 ** 10, r: 8, p: 1, length: 32, maxmem: 32 * 1024 * 1024 });
const ID = "AAAAA-BBBBB-CCCCC-DDDDD-EEEEE";

const made = [];
const servers = [];

after(async () => {
    await Promise.all(servers.map((server) => server.close().catch(() => {})));
    await Promise.all(made.map((folder) => rm(folder, { recursive: true, force: true })));
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test, what, ms = 5000) {
    const end = Date.now() + ms;

    while (!(await test())) {
        assert.ok(Date.now() < end, `waited for ${what}`);
        await wait(10);
    }
}

// A system's tool, faked: what it was run as, and its output fed to it a line at a time
function fakeSpawn() {
    const ran = [];
    const spawn = (command, args) => {
        const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), killed: false });

        child.kill = () => {
            child.killed = true;
            child.emit("exit", null, "SIGTERM");
        };
        child.say = (...lines) => child.stdout.write(lines.map((line) => `${line}\n`).join(""));
        ran.push({ command: [command, ...args], child });

        return child;
    };

    return { ran, spawn };
}

// What a handle says, as it says it
function heard(handle) {
    const said = [];

    for (const event of ["registered", "found", "lost", "refused", "ended"]) {
        handle.on(event, (value) => said.push([event, value]));
    }

    return said;
}

describe("Bonjour on each system, its tool read as it talks (platform/)", () => {
    it("advertises with dns-sd on macOS, taking the name the responder gives, and names its refusals", async () => {
        const { ran, spawn } = fakeSpawn();
        const mac = bonjour({ system: "darwin", spawn });
        const txt = txtOf({ id: ID, name: "Studio Mac", version: "2.0.0", net: 50, port: 8480, worlds: 2 });
        const advert = mac.advertise({ name: "Studio Mac", port: 8480, txt });
        const said = heard(advert);

        assert.deepEqual(ran[0].command, ["/usr/bin/dns-sd", "-R", "Studio Mac", SERVICE, "local", "8480", ...txt]);
        ran[0].child.say("Registering Service Studio Mac._pellagos._tcp port 8480 TXT txtvers=1", "DATE: ---Tue 13 Oct 2026---", " 3:39:54.123  ...STARTING...", " 3:39:54.456  Got a reply for service Studio Mac (2)._pellagos._tcp.local.: Name now registered and active");
        await until(() => said.length, "registered");
        assert.deepEqual(said, [["registered", "Studio Mac (2)"]]);

        // (Refused by the Local Network permission: said, and the tool ended)
        const refused = mac.advertise({ name: "Studio Mac", port: 8480, txt });
        const no = heard(refused);

        ran[1].child.say("DNSService call failed -65570");
        await until(() => no.length, "refused");
        assert.equal(no[0][0], "refused");
        assert.equal(no[0][1].code, "denied");
        assert.match(no[0][1].message, /System Settings › Privacy & Security › Local Network/);
        assert.ok(ran[1].child.killed);
        assert.equal(dnsSdRefusal(" 3:39:54.456  Error -65563").code, "not-running");
        assert.equal(dnsSdRefusal("Error -65555").code, "denied");
        assert.equal(dnsSdRefusal("12 servers found"), null);

        // (Stopped by the server: nothing more said)
        advert.stop();
        assert.ok(ran[0].child.killed);
        assert.equal(said.length, 1);
    });

    it("browses with dns-sd: an instance found on its first interface, lost with its last; and resolves one, TXT and all", async () => {
        const { ran, spawn } = fakeSpawn();
        const mac = bonjour({ system: "darwin", spawn });
        const browser = mac.browse();
        const said = heard(browser);

        assert.deepEqual(ran[0].command, ["/usr/bin/dns-sd", "-B", SERVICE, "local"]);
        ran[0].child.say(
            "Browsing for _pellagos._tcp.local",
            "Timestamp     A/R    Flags  if Domain               Service Type         Instance Name",
            " 3:39:54.456  Add        3   6 local.               _pellagos._tcp.      Sam's Mac",
            " 3:39:54.457  Add        2  14 local.               _pellagos._tcp.      Sam's Mac",
            " 3:39:58.001  Rmv        1   6 local.               _pellagos._tcp.      Sam's Mac",
        );
        await wait(20);
        assert.deepEqual(said, [["found", { name: "Sam's Mac" }]]);
        ran[0].child.say(" 3:39:58.002  Rmv        0  14 local.               _pellagos._tcp.      Sam's Mac");
        await until(() => said.length === 2, "lost");
        assert.deepEqual(said[1], ["lost", { name: "Sam's Mac" }]);
        browser.stop();

        const resolving = mac.resolve("Sam's Mac");

        assert.deepEqual(ran[1].command, ["/usr/bin/dns-sd", "-L", "Sam's Mac", SERVICE, "local"]);
        ran[1].child.say("Lookup Sam's Mac._pellagos._tcp.local", " 3:39:54.500  Sam's\\032Mac._pellagos._tcp.local. can be reached at Sams-Mac.local.:8480 (interface 6)", ` ${txtOf({ id: ID, name: "Sam's Mac", version: "2.0.0", net: 50, port: 8480, worlds: 1 }).join(" ")}`);

        const where = await resolving;

        assert.equal(where.host, "Sams-Mac.local");
        assert.equal(where.port, 8480);
        assert.deepEqual(cardOfTxt(where.txt), { id: ID, name: "Sam's Mac", version: "2.0.0", net: 50, port: 8480, worlds: 1 });
        assert.ok(ran[1].child.killed, "(the lookup ended once it's answered)");

        // (Its lines, read alone)
        assert.equal(browseLine("Timestamp     A/R    Flags  if Domain"), null);
        assert.deepEqual(reachedLine("x can be reached at a.local.:9 (interface 1)"), { host: "a.local", port: 9 });
        assert.deepEqual(txtLine(" a=b c=d\\ e"), ["a=b", "c=d e"]);
    });

    it("browses with avahi on Linux, which resolves as it finds, and says when its daemon isn't running", async () => {
        const { ran, spawn } = fakeSpawn();
        const linux = bonjour({ system: "linux", spawn });
        const browser = linux.browse();
        const said = heard(browser);
        const txt = txtOf({ id: ID, name: "Sam's Mac", version: "2.0.0", net: 50, port: 8480, worlds: 3 })
            .map((entry) => `"${entry}"`)
            .join(" ");

        assert.deepEqual(ran[0].command, ["avahi-browse", "-rpk", SERVICE]);
        ran[0].child.say("+;eth0;IPv6;Sam's\\032Mac;_pellagos._tcp;local", `=;eth0;IPv6;Sam's\\032Mac;_pellagos._tcp;local;sams-mac.local;fe80::1;8480;${txt}`, `=;eth0;IPv4;Sam's\\032Mac;_pellagos._tcp;local;sams-mac.local;192.168.1.20;8480;${txt}`, "-;eth0;IPv6;Sam's\\032Mac;_pellagos._tcp;local");
        await until(() => said.length === 2, "found twice");
        assert.equal(said[1][1].address, "192.168.1.20", "(its IPv4 address, once it has one)");
        assert.equal(said[1][1].host, "sams-mac.local");
        assert.equal(cardOfTxt(said[1][1].txt).worlds, 3);
        ran[0].child.say("-;eth0;IPv4;Sam's\\032Mac;_pellagos._tcp;local");
        await until(() => said.length === 3, "lost");
        assert.deepEqual(said[2], ["lost", { name: "Sam's Mac" }]);
        assert.equal(avahiLine("+;eth0;IPv4;Printer;_ipp._tcp;local"), null, "(another service's: not ours)");

        const advert = linux.advertise({ name: "Studio", port: 8480, txt: ["a=b"] });
        const no = heard(advert);

        assert.deepEqual(ran[1].command, ["avahi-publish-service", "-s", "Studio", SERVICE, "8480", "a=b"]);
        ran[1].child.stderr.write("Failed to connect to Avahi server: Daemon not running\n");
        await until(() => no.length, "refused");
        assert.equal(no[0][1].code, "no-daemon");

        // (No tools at all, and no Bonjour on Windows yet)
        const missing = linux.advertise({
            name: "Studio",
            port: 8480,
            txt: [],
        });
        const gone = heard(missing);

        ran[2].child.emit("error", Object.assign(new Error("spawn avahi-publish-service ENOENT"), { code: "ENOENT" }));
        await until(() => gone.length, "no tools");
        assert.equal(gone[0][1].code, "no-tools");

        const windows = heard(bonjour({ system: "win32" }).browse());

        await until(() => windows.length, "unsupported");
        assert.equal(windows[0][1].code, "unsupported");
        assert.equal(refusal("nonsense").message, REFUSALS.failed);
    });

    it("reads its TXT record back as it was written, whatever's in the name; and nothing that isn't a Pellagos server's", () => {
        for (const name of ["Studio Mac", "Sam's \"best\" server & co (2)", "Ægir's 🐉 lair; $HOME `x`", "a=b c=d"]) {
            const card = { id: ID, name, version: "2.0.0-beta.1", net: 50, port: 9000, worlds: 4 };
            const txt = txtOf(card);

            assert.ok(
                txt.every((entry) => /^[a-z]+=[A-Za-z0-9._%-]*$/.test(entry)),
                txt.join(" "),
            );
            assert.deepEqual(cardOfTxt(txt), card);
            assert.deepEqual(cardOfTxt(txtLine(` ${txt.join(" ")}`)), card, "(through dns-sd's way of showing it)");
        }

        assert.equal(cardOfTxt(["path=/", "id=nope"]), null);
        assert.equal(cardOfTxt([]), null);
    });
});

// A world server on loopback, on the fake network, as `host` there (its IPv4 address 10.0.0.N)
async function serve(network, { host, name, ip }) {
    const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-nearby-"));
    const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }), name, bonjour: network.bonjour(host) });

    made.push(folder);
    servers.push(server);
    network.addresses.set(host, ip);
    server.nearby.lookup = (found) => network.lookup(found);
    server.nearby.settle = 5;
    server.nearby.retry = 30;
    await server.listen(0, "127.0.0.1");

    return server;
}

describe("world servers finding each other on the Wi-Fi (nearby.js)", () => {
    it("advertise themselves, list each other (never themselves) in their status, and lose each other when one goes", async () => {
        const network = new FakeNetwork();
        const studio = await serve(network, { host: "studio-mac.local", name: "Studio Mac", ip: "10.0.0.2" });
        const sams = await serve(network, { host: "sams-mac.local", name: "Sam's Mac", ip: "10.0.0.3" });

        await until(() => studio.nearby.list().length && sams.nearby.list().length, "each to find the other");
        assert.deepEqual(studio.nearby.state(), { on: true, available: true, as: "Studio Mac", refused: null });

        const [near] = studio.nearby.list();

        assert.deepEqual({ ...near, seen: undefined }, { name: "Sam's Mac", id: sams.identity.id, version: SERVER_VERSION, net: NET_VERSION, worlds: 0, address: `sams-mac.local:${sams.port}`, ip: `10.0.0.3:${sams.port}`, seen: undefined });
        assert.deepEqual(
            sams.nearby.list().map((one) => one.id),
            [studio.identity.id],
        );

        // (In its status, with its own name on its card)
        const status = await (await fetch(`http://127.0.0.1:${studio.port}/api/v1/status`)).json();

        assert.equal(status.server.name, "Studio Mac");
        assert.deepEqual(
            status.nearby.map((one) => one.name),
            ["Sam's Mac"],
        );

        // (The game from a nearby server's own page plays here too, by its exact address; no other
        // site's does, and the server's management never answers it)
        const from = async (origin, route = "/api/v1/status") => fetch(`http://127.0.0.1:${studio.port}${route}`, { headers: { Origin: origin } });

        assert.ok(studio.nearby.allows(`http://sams-mac.local:${sams.port}`));
        assert.ok(studio.nearby.allows(`http://10.0.0.3:${sams.port}`));
        assert.ok(!studio.nearby.allows(`http://sams-mac.local:${sams.port + 1}`));
        assert.ok(!studio.nearby.allows("null"));

        const allowed = await from(`http://10.0.0.3:${sams.port}`);

        assert.equal(allowed.status, 200);
        assert.equal(allowed.headers.get("access-control-allow-origin"), `http://10.0.0.3:${sams.port}`);
        assert.equal((await from("http://10.0.0.9:8480")).status, 403);
        assert.equal((await from("null")).status, 403);
        assert.equal((await from(`http://10.0.0.3:${sams.port}`, "/api/v1/server")).status, 403);

        // (A world listed: advertised again, and the other sees it)
        await studio.createWorld({ name: "Thornwick", seed: 1, race: "human", settings: { listed: true } });
        studio.nearby.refresh();
        await until(() => sams.nearby.list()[0]?.worlds === 1, "the listed world counted");

        // (Gone: lost)
        await sams.close();
        await until(() => !studio.nearby.list().length, "Sam's Mac lost");
        await studio.close();
        assert.equal(network.adverts.size, 0);
    });

    it("renamed by its owner, is advertised again under its new name, and the others list it so; left empty, under the computer's own again", async () => {
        const network = new FakeNetwork();
        const studio = await serve(network, { host: "studio-mac.local", name: "Studio Mac", ip: "10.0.0.2" });
        const sams = await serve(network, { host: "sams-mac.local", name: "Sam's Mac", ip: "10.0.0.3" });

        await until(() => studio.nearby.list().length && sams.nearby.list().length, "each to find the other");
        await sams.manage.changeSettings({ name: "Pellagos Home Server" });
        await until(() => studio.nearby.list()[0]?.name === "Pellagos Home Server", "listed under its new name");
        assert.equal(sams.nearby.state().as, "Pellagos Home Server");
        assert.match(sams.manage.overview().bonjour.words, /Shown to others on the Wi-Fi as “Pellagos Home Server”/);
        assert.deepEqual(
            studio.nearby.list().map((one) => one.name),
            ["Pellagos Home Server"],
            "(its old name gone)",
        );

        await sams.manage.changeSettings({ name: "" });
        await until(() => studio.nearby.list()[0]?.name === "Sam's Mac", "listed under the computer's own again");
        await sams.close();
        await studio.close();
    });

    it("follows its bonjour setting as it runs; and, refused, says why, serves players all the same, and tries again", async () => {
        const network = new FakeNetwork();
        const studio = await serve(network, { host: "studio-mac.local", name: "Studio Mac", ip: "10.0.0.2" });
        const sams = await serve(network, { host: "sams-mac.local", name: "Sam's Mac", ip: "10.0.0.3" });

        await until(() => studio.nearby.list().length && sams.nearby.list().length, "each to find the other");
        await sams.manage.changeSettings({ bonjour: false });
        await until(() => !studio.nearby.list().length, "Sam's Mac no longer shown");
        assert.deepEqual(sams.nearby.list(), [], "(nor looking)");
        assert.match(sams.manage.overview().bonjour.words, /Bonjour is off in Settings/);
        await sams.manage.changeSettings({ bonjour: true });
        await until(() => studio.nearby.list().length === 1 && sams.nearby.list().length === 1, "both seen again");
        assert.match(sams.manage.overview().bonjour.words, /Shown to others on the Wi-Fi as “Sam's Mac”/);

        // (Refused: why, on the page; the status still answers; tried again, it's shown once it's allowed)
        await sams.close();
        await studio.close();
        network.refuse = "denied";

        const refused = await serve(network, { host: "studio-mac.local", name: "Studio Mac", ip: "10.0.0.2" });

        await until(() => refused.nearby.state().refused, "refused");
        assert.equal(refused.manage.overview().bonjour.words, REFUSALS.denied);
        assert.equal((await fetch(`http://127.0.0.1:${refused.port}/api/v1/status`)).status, 200);
        network.refuse = null;
        await until(() => refused.nearby.state().as === "Studio Mac", "shown once it's allowed");
        assert.equal(refused.nearby.state().refused, null);
    });

    it("is never on without a Bonjour to use (the tests' servers, and any made without one)", async () => {
        const folder = await mkdtemp(path.join(os.tmpdir(), "pellagos-nearby-"));
        const server = await WorldServer.open(folder, { cost: CHEAP, awake: () => ({ stop() {} }) });

        made.push(folder);
        servers.push(server);
        await server.listen(0, "127.0.0.1");
        assert.deepEqual(server.nearby.state(), { on: false, available: false, as: null, refused: null });
        assert.match(server.manage.overview().bonjour.words, /without Bonjour/);
        assert.deepEqual((await (await fetch(`http://127.0.0.1:${server.port}/api/v1/status`)).json()).nearby, []);
    });
});
