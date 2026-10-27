// The world server's management page (generated/world_server_plan.md §10), as the server serves it
// (server/admin.js): on its own computer at localhost:8481, needing no key (every call carries the
// cookie the page was given and the management header); from the Wi-Fi at /admin on the play port,
// where the admin key's traded for a session, kept in this tab alone. It calls the server's own
// /api/v1 (server/api.js), and shows:
//
// - Overview: where players reach it (each address with a QR code), the admin key (on the computer
//   itself), the internet, about, power, how many worlds it may run, stopping it.
// - Worlds: a card each, most recently played first, its state in words; Play, Start or Set aside,
//   Keys, Players, Backups, Crash reports, Settings, Export, Delete (its name typed).
// - New world: its basics, heroes and rules; then its owner's and players' keys, as links and QR codes.
// - Settings: the server's, each with what it's for; creator keys.
// - Activity: the server's journal and every world's. Health: how each world's keeping up.

import { qrcode } from "../../vendor/qrcode-generator-2.0.4/qrcode.min.js";
import { addressOf, inviteLink } from "../app/invites.js";

const API = "/api/v1";

/** The header every management call carries (server/admin.js ADMIN_HEADER). */
const MANAGE = Object.freeze({ "x-pellagos": "manage" });

/** Where the session the admin key was traded for is kept (this tab alone). */
const SESSION = "pellagos.admin.session";

/** How often what's shown is asked for again (ms), while it's on screen. */
const REFRESH = 5000;

/** A world's lives, as the cards name them (server/registry.js LIFE). */
const LIFE_WORDS = Object.freeze({ stored: "Set aside", waiting: "Waiting", loading: "Opening", running: "Running", empty: "Empty", stopping: "Saving" });

/** Why each backup was made, as it's shown. */
const WHY = Object.freeze({ hourly: "Hourly", daily: "Daily", "by-hand": "Made by hand", "before-restore": "Before a restore", "before-delete": "Before it was deleted", "before-fresh-start": "Before a fresh start" });

const ROLES = Object.freeze([
    ["player", "Player"],
    ["trusted", "Trusted"],
    ["owner", "Owner"],
]);

const $ = (selector) => document.querySelector(selector);

const state = { session: null, server: null, worlds: [], tab: "overview", world: null, worldTab: "settings", timer: null };

const sessions = {
    get() {
        try {
            return sessionStorage.getItem(SESSION);
        } catch {
            return null;
        }
    },
    set(session) {
        try {
            if (session) {
                sessionStorage.setItem(SESSION, session);
            } else {
                sessionStorage.removeItem(SESSION);
            }
        } catch {
            // (Kept in memory alone, then)
        }
    },
};

// ---- Little helpers

/** An element: its tag, its attributes (or properties, for anything not a string, and handlers), and what's in it. */
function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props ?? {})) {
        if (value === undefined || value === null || value === false) {
            continue;
        }

        if (key === "class") {
            node.className = value;
        } else if (key === "dataset") {
            Object.assign(node.dataset, value);
        } else if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (typeof value !== "string" && key in node) {
            node[key] = value;
        } else {
            node.setAttribute(key, value === true ? "" : String(value));
        }
    }

    node.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));

    return node;
}

const button = (label, onClick, kind = "") => h("button", { type: "button", class: kind, onClick }, label);
const panel = (title, ...children) => h("section", { class: "panel" }, h("h2", {}, title), ...children);
const facts = (pairs) => h("dl", { class: "facts" }, pairs.filter(Boolean).map(([term, value]) => [h("dt", {}, term), h("dd", {}, value)]));

function bytes(n) {
    if (n === null || n === undefined) {
        return "—";
    }

    return n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} bytes`;
}

function duration(ms) {
    const minutes = Math.round((ms ?? 0) / 60000);

    if (minutes < 1) {
        return "under a minute";
    }

    if (minutes < 60) {
        return `${minutes} min`;
    }

    const hours = Math.floor(minutes / 60);

    return hours < 48 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} days`;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never");

/** A QR code of `text`, as a picture. */
function qr(text) {
    const code = qrcode(0, "M");

    code.addData(text);
    code.make();

    return h("div", { class: "qr" }, h("img", { src: code.createDataURL(4, 8), alt: `QR code: ${text}`, title: text }));
}

/** A thing to copy: as text, with a button that copies it. */
function copyable(text, { link = false } = {}) {
    const copy = button("Copy", async () => {
        try {
            await navigator.clipboard.writeText(text);
            copy.textContent = "Copied";
        } catch {
            copy.textContent = "Select it and copy";
        }
    });

    return h("div", { class: "row" }, link ? h("a", { href: text, target: "_blank", rel: "noopener", class: "code" }, text) : h("code", {}, text), copy);
}

/** What's said at the top: how something went. */
function say(text = "", { bad = false } = {}) {
    const status = $("#status");

    status.textContent = text;
    status.classList.toggle("bad", bad);
}

// ---- The API

/** A call to the server's API: its answer (JSON), or the response itself for a download. Throws, saying why, if it's refused. A `raw` body (a file) is sent as it is. */
async function call(method, route, body, { key = null, raw = false } = {}) {
    const headers = { ...MANAGE, ...(body === undefined ? {} : { "Content-Type": raw ? "application/octet-stream" : "application/json" }) };

    if (key) {
        headers.Authorization = `Key ${key}`;
    } else if (state.session) {
        headers.Authorization = `Bearer ${state.session}`;
    }

    let response;

    try {
        response = await fetch(`${API}${route}`, { method, headers, credentials: "same-origin", ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }) });
    } catch {
        throw Object.assign(new Error("The server isn't answering: is it still running?"), { status: 0 });
    }

    const json = response.headers.get("content-type")?.includes("application/json");

    if (!response.ok) {
        const answer = json ? await response.json().catch(() => ({})) : {};

        throw Object.assign(new Error(answer.message ?? `Refused (${response.status}).`), { status: response.status, error: answer.error });
    }

    return json ? response.json() : response;
}

/** Something done, saying how it went (in `status`: an element, or the page's own). Returns its answer, or null if it failed. */
async function doing(work, { status = null, done = "" } = {}) {
    const where = status ?? $("#status");

    where.textContent = "";
    where.classList?.remove("bad");

    try {
        const answer = await work();

        where.textContent = done;

        return answer ?? true;
    } catch (error) {
        where.textContent = error.message;
        where.classList?.add("bad");

        return null;
    }
}

/** A download (an export, a backup): fetched, then saved as its file. */
async function download(route) {
    const response = await call("GET", route);
    const blob = await response.blob();
    const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "world.pellagos.json.gz";
    const link = h("a", { href: URL.createObjectURL(blob), download: name });

    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
}

// ---- Where players reach it

/** Whether this page is the computer's own (localhost:8481), not the Wi-Fi's /admin. */
const onMac = () => Boolean(state.server?.overview.mac);

/** The game's page on this server, as this page's reader would open it: on the computer itself, localhost; else this page's own address. */
function playPage() {
    return onMac() ? `${state.server.overview.addresses[0]}/` : `${location.origin}/`;
}

/** The game's page as it's given to others: the server's address on the Wi-Fi (an IPv4 one first: every phone finds those). */
function sharePage() {
    const home = state.server.overview.addresses.filter((address) => !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(address));
    const plain = home.find((address) => /\/\/\d+\.\d+\.\d+\.\d+[:/]/.test(address));

    return `${plain ?? home[0] ?? playPage().replace(/\/$/, "")}/`.replace(/\/\/$/, "/");
}

/** An invite to a world (app/invites.js), on `page`: with a key, a short code or a ticket. */
function linkTo(world, extra, page = sharePage()) {
    return inviteLink(page, { address: addressOf(new URL(page).host), id: state.server.overview.id, world, ...extra });
}

// ---- Dialogs

/** Something shown once (a key, a ticket, a code), with its link and QR code. */
function showOnce({ title, note = "", value = null, code = null, link = null, more = [] }) {
    $("#showntitle").textContent = title;
    $("#shownnote").textContent = note;
    $("#shownbody").replaceChildren(
        ...[
            code ? h("p", { class: "shown-code" }, code) : null,
            value ? h("p", { class: "shown-value" }, value) : null,
            link ? h("div", { class: "address" }, qr(link), copyable(link, { link: true })) : null,
            ...more,
        ].filter(Boolean),
    );
    if (!$("#shown").open) {
        $("#shown").showModal();
    }
}

/** Something that can't be undone, asked again (`typed`: a name to type first). Resolves whether to go on. */
function confirmIt({ title, note = "", go, typed = null }) {
    const dialog = $("#confirm");

    $("#confirmtitle").textContent = title;
    $("#confirmnote").textContent = note;
    $("#confirmgo").textContent = go;
    $("#confirmtyped").hidden = !typed;
    $("#confirmname").value = "";
    $("#confirmstatus").textContent = "";
    dialog.showModal();

    return new Promise((resolve) => {
        const finish = (yes) => {
            $("#confirmform").onsubmit = null;
            $("#confirmback").onclick = null;
            dialog.close();
            resolve(yes);
        };

        $("#confirmform").onsubmit = (event) => {
            event.preventDefault();

            if (typed && $("#confirmname").value.trim() !== typed) {
                $("#confirmstatus").textContent = `Type "${typed}" to go on.`;

                return;
            }

            finish(true);
        };
        $("#confirmback").onclick = () => finish(false);
    });
}

// ---- Overview

/** Whether it's shown to others on the Wi-Fi (Bonjour), and the servers it's found near it there. */
function nearbyPanel({ bonjour, nearby }) {
    const rows = nearby.map((near) =>
        h(
            "tr",
            { dataset: { nearby: near.id } },
            h("td", {}, near.name),
            h("td", {}, near.version ?? "—"),
            h("td", {}, Number.isFinite(near.worlds) ? String(near.worlds) : "—"),
            h("td", {}, [...new Set([near.ip, near.address].filter(Boolean))].map((where) => h("div", {}, h("a", { href: `http://${where}/`, target: "_blank", rel: "noopener" }, where)))),
        ),
    );

    return panel(
        "On the Wi-Fi",
        h("p", { class: bonjour.refused ? "warning" : "" }, bonjour.words),
        bonjour.on && !bonjour.refused
            ? rows.length
                ? h("div", { class: "table" }, h("table", {}, h("thead", {}, h("tr", {}, h("th", {}, "Nearby server"), h("th", {}, "Version"), h("th", {}, "Worlds listed"), h("th", {}, "Where"))), h("tbody", {}, rows)))
                : h("p", { class: "muted" }, "No other Pellagos servers found near it yet.")
            : null,
        h("p", { class: "muted small" }, "Players who reach this server see the others it finds, under Worlds on servers, and add them with a tap."),
    );
}

/**
 * Whether it answers the internet (§9.1: over TLS alone, with the `internet` setting on and a
 * certificate), its secure addresses, its certificate, and a certificate of the owner's own put in
 * (its key and chain, PEM) or taken out.
 */
// Free certificates from Let's Encrypt (server/certify.js): how getting them goes, asked for again
// or let go; or, if they aren't got yet, the form that sets it up (the routes, and the CA's terms,
// asked of the server once it's opened)
function acmePart(acme) {
    const status = h("p", { class: "warning", role: "status" });

    if (acme) {
        return h(
            "div",
            { class: "acme" },
            h("h3", {}, "Free certificates"),
            h("p", { class: acme.last && !acme.last.ok ? "warning" : acme.issued ? "good" : "" }, acme.words),
            facts([
                ["How", acme.label],
                ["For", acme.names.join(", ")],
                acme.hostLabel ? ["DNS host", acme.hostLabel] : null,
                ["Last got", when(acme.issued)],
                acme.renewAt ? ["Renewed next", `about ${when(acme.renewAt)}`] : null,
                acme.last && !acme.last.ok ? ["Last try", `${when(acme.last.at)}: ${acme.last.message}`] : null,
            ]),
            h(
                "div",
                { class: "actions" },
                button(acme.working ? "Getting one…" : "Get one now", async () => {
                    if (await doing(() => call("POST", "/server/certificate/acme/renew", {}), { status, done: "Asked: it takes a minute or so." })) {
                        await renderOverview();
                    }
                }),
                button(
                    "Stop getting them",
                    async () => {
                        if (await confirmIt({ title: "Stop getting free certificates", note: "The server forgets how it got them, and the token it was given. The certificate it has stays till it runs out (or it's taken out).", go: "Stop" })) {
                            if (await doing(() => call("DELETE", "/server/certificate/acme"), { status })) {
                                await renderOverview();
                            }
                        }
                    },
                    "danger",
                ),
            ),
            status,
        );
    }

    const form = h("form", { class: "acme" }, h("p", { class: "muted small" }, "Asking Let's Encrypt for its terms…"));
    const part = h(
        "details",
        { class: "acme" },
        h("summary", {}, "A free certificate from Let's Encrypt"),
        h("p", { class: "muted small" }, "The server gets one itself, and renews it before it runs out. Choose how it proves the name (or address) is yours."),
        form,
        status,
    );

    part.addEventListener("toggle", async () => {
        if (!part.open || form.dataset.ready) {
            return;
        }

        const choices = await doing(() => call("GET", "/server/certificate/acme"), { status });

        if (choices) {
            form.dataset.ready = "yes";
            form.replaceChildren(...acmeForm(choices, status));
        }
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const { route, name, host, token, address, email, agree } = form.elements;
        const body = { route: route.value, name: name.value, host: route.value === "duckdns" ? "duckdns" : host.value, token: token.value, address: address.value, email: email.value || null, agree: agree.checked };

        if (await doing(() => call("POST", "/server/certificate/acme", body), { status, done: "Set up: it's getting the certificate." })) {
            await renderOverview();
        }
    });

    return part;
}

// The free certificate's form: the route, then what that route needs (each shown for its route alone)
function acmeForm({ routes, hosts, terms, tokens }, status) {
    const route = select("route", Object.entries(routes).map(([id, { label }]) => [id, label]), "duckdns");
    const host = select("host", Object.entries(hosts).filter(([, one]) => one.route === "dns").map(([id, { label }]) => [id, label]), "cloudflare");
    const tokenLabel = h("span", {});
    const notes = {
        duckdns: "Sign in at duckdns.org, add a name, and paste the token shown at the top of the page there. The server keeps the name pointed at this home.",
        dns: "Your domain's DNS must be with Cloudflare or deSEC: the token lets the server write the record that proves the domain's yours.",
        ip: "The router must send the internet's port 443 to this server's port. Certificates for an address last under a week, so it renews one every couple of days.",
    };
    const note = h("p", { class: "muted small" });
    const kept = tokens ? h("p", { class: "muted small" }, `A token's kept in ${tokens}, and never shown again.`) : null;
    const fields = {
        name: field("The name", h("input", { name: "name", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "yourname.duckdns.org" })),
        host: field("Its DNS host", host),
        token: field(tokenLabel, h("input", { name: "token", type: "password", autocomplete: "off", spellcheck: "false" })),
        address: field("This home's address, as the internet sees it", h("input", { name: "address", type: "text", autocomplete: "off", spellcheck: "false", placeholder: "203.0.113.7" })),
    };
    const shown = () => {
        const which = route.value;
        const kind = which === "duckdns" ? "duckdns" : host.value;

        fields.name.hidden = which === "ip";
        fields.name.querySelector("input").placeholder = which === "duckdns" ? "yourname.duckdns.org" : "play.example.com";
        fields.host.hidden = which !== "dns";
        fields.token.hidden = which === "ip";
        fields.address.hidden = which !== "ip";

        if (kept) {
            kept.hidden = which === "ip";
        }

        tokenLabel.textContent = hosts[kind]?.token ?? "Its token";
        note.textContent = notes[which];
    };

    route.addEventListener("change", shown);
    host.addEventListener("change", shown);
    shown();
    status.textContent = "";

    return [
        field("How", route),
        note,
        fields.name,
        fields.host,
        fields.token,
        fields.address,
        field("An email for Let's Encrypt to write to, if it must (not needed)", h("input", { name: "email", type: "email", autocomplete: "email" })),
        h("label", { class: "check" }, h("input", { type: "checkbox", name: "agree" }), "I agree to Let's Encrypt's ", terms ? h("a", { href: terms, target: "_blank", rel: "noopener" }, "terms of service") : "terms of service"),
        kept,
        h("button", { type: "submit" }, "Get a certificate"),
    ];
}

// The home's router (server/router.js), while the internet's answered: what it forwards, how the
// internet sees this home, whether the server reached itself; or why it won't, and how to forward
// the port by hand. Asked again on demand
function routerPart(router, on) {
    if (!router || !on) {
        return null;
    }

    const status = h("p", { class: "warning", role: "status" });
    const failing = router.error || router.sharing || !router.asking;
    const ports = router.mappings.map(({ external, internal }) => (external === internal ? String(external) : `${external} (to ${internal})`)).join(", ");

    return h(
        "div",
        { class: "acme" },
        h("h3", {}, "The router"),
        h("p", { class: failing ? "warning" : router.hairpin ? "good" : "" }, router.words),
        router.mappings.length
            ? facts([
                  ["Asked by", router.methodLabel],
                  ["Its public address", router.external ?? "unknown"],
                  router.seen && router.seen !== router.external ? ["The internet sees", router.seen] : null,
                  ["Ports forwarded", ports],
                  router.pinhole ? ["IPv6", `${router.pinhole.address}, port ${router.pinhole.port}`] : null,
                  router.checkedAt ? ["Looked", when(router.checkedAt)] : null,
              ])
            : null,
        router.asking
            ? h(
                  "div",
                  { class: "actions" },
                  button(router.working ? "Asking…" : "Ask the router again", async () => {
                      if (await doing(() => call("POST", "/server/router", {}), { status, done: "Asked." })) {
                          await renderOverview();
                      }
                  }),
              )
            : null,
        status,
    );
}

// Tailscale Funnel (server/funnel.js): the way in for a home whose provider shares its address. Not
// asked for: what it is, and a button to use it (named the way in when the router says the
// provider shares the address). Asked for: how it stands, where Tailscale says to put it right, asked again
// or no longer used
function funnelPart(funnel, { sharing = null } = {}) {
    if (!funnel) {
        return null;
    }

    const status = h("p", { class: "warning", role: "status" });
    const use = (on) => doing(() => call("PATCH", "/server", { settings: { funnel: on } }), { status });

    if (!funnel.asking) {
        return h(
            "details",
            { class: "funnel" },
            h("summary", {}, sharing ? "Tailscale Funnel: the way in when the provider shares the address" : "Tailscale Funnel"),
            h("p", { class: "muted small" }, funnel.words),
            h("p", { class: "muted small" }, "Install Tailscale on this computer (tailscale.com/download), sign in, and allow Funnel for it. Players then reach the server at this computer's name on your tailnet, with Tailscale's own certificate: no router, no certificate of the server's own."),
            h(
                "div",
                { class: "actions" },
                button("Use Tailscale Funnel", async () => {
                    if (await use(true)) {
                        await renderOverview();
                    }
                }),
            ),
            status,
        );
    }

    return h(
        "div",
        { class: "acme" },
        h("h3", {}, "Tailscale Funnel"),
        h("p", { class: funnel.url ? "good" : funnel.error ? "warning" : "" }, funnel.words),
        funnel.allow && !funnel.url ? h("p", {}, h("a", { href: funnel.allow, target: "_blank", rel: "noopener" }, "Put it right in Tailscale")) : null,
        facts([funnel.url ? ["Players type", funnel.url.replace(/^https:\/\//, "")] : null, ["The tunnel, on this computer alone", `127.0.0.1:${funnel.port ?? "—"}`], funnel.checkedAt ? ["Looked", when(funnel.checkedAt)] : null]),
        h(
            "div",
            { class: "actions" },
            button(funnel.working ? "Asking…" : "Ask Tailscale again", async () => {
                if (await doing(() => call("POST", "/server/funnel", {}), { status, done: "Asked." })) {
                    await renderOverview();
                }
            }),
            button(
                "Stop using Funnel",
                async () => {
                    if (await confirmIt({ title: "Stop using Tailscale Funnel", note: "Tailscale stops bringing the internet to the server, and whoever came in that way is sent out.", go: "Stop" })) {
                        if (await use(false)) {
                            await renderOverview();
                        }
                    }
                },
                "danger",
            ),
        ),
        status,
    );
}

// What games found reaching the server from elsewhere ("Test this server"), the latest first; and,
// while the internet reaches it, a code a phone on its cellular data scans to test it (the game
// opened at its internet address, testing it at once: #test)
function testsPart(tests, addresses = []) {
    if (!tests) {
        return null;
    }

    const scan = addresses[0] ? `${addresses[0]}/#test` : null;

    const latest = tests.reports[0];
    const proved = latest && latest.from === "internet" && latest.results.some((one) => one.ok);

    return h(
        "div",
        { class: "acme" },
        h("h3", {}, "Tested from outside"),
        h("p", { class: proved ? "good" : latest ? "warning" : "muted" }, tests.words),
        scan
            ? h(
                  "div",
                  { class: "addresses" },
                  h("div", { class: "address" }, qr(scan), copyable(scan, { link: true })),
                  h("p", { class: "muted small" }, "On a phone with the Wi-Fi turned off (its cellular data, so it's really the internet), scan this: the game opens at the server's internet address and tests it, and what it finds comes back here."),
              )
            : null,
        tests.reports.length > 1
            ? h(
                  "details",
                  {},
                  h("summary", {}, "Earlier tests"),
                  facts(tests.reports.slice(1).map((report) => [when(report.at), `from ${report.from === "home" ? "the Wi-Fi" : report.address === "tunnel" ? "the internet, through Tailscale Funnel" : report.address}: ${report.results.map((one) => `${one.address} ${one.ok ? "reached" : "not reached"}`).join(", ")}`])),
              )
            : null,
    );
}

function internetPanel({ internet }) {
    const { certificate } = internet;
    const status = h("p", { class: "warning", role: "status" });
    const opening = (on) => doing(() => call("PATCH", "/server", { settings: { internet: on } }), { status });
    const sharing = internet.router?.sharing ?? null;
    const own = h(
        "form",
        { class: "certificate" },
        field("Its key (PEM: server.key, privkey.pem)", h("input", { type: "file", name: "key", accept: ".key,.pem,.txt", required: true })),
        field("Its certificate and chain (PEM: fullchain.pem)", h("input", { type: "file", name: "cert", accept: ".crt,.pem,.cer,.txt", required: true })),
        h("button", { type: "submit" }, certificate ? "Use this one instead" : "Use it"),
    );

    own.addEventListener("submit", async (event) => {
        event.preventDefault();

        const [key, cert] = await Promise.all([own.elements.key.files[0]?.text(), own.elements.cert.files[0]?.text()]);

        if (await doing(() => call("PUT", "/server/certificate", { key, cert }), { status, done: "Put in." })) {
            await renderOverview();
        }
    });

    return panel(
        "The internet",
        h("p", { class: internet.open ? "good" : "" }, internet.words),
        h(
            "div",
            { class: "actions" },
            internet.on
                ? button(
                      "Close to the internet",
                      async () => {
                          if (await confirmIt({ title: "Close to the internet", note: "From this moment the internet isn't answered: the router's forwarding and Tailscale Funnel are let go, and everyone in from the internet is sent out. The Wi-Fi carries on.", go: "Close it" })) {
                              if (await opening(false)) {
                                  await renderOverview();
                              }
                          }
                      },
                      "danger",
                  )
                : button("Open to the internet", async () => {
                      if (await opening(true)) {
                          await renderOverview();
                      }
                  }),
        ),
        status,
        internet.addresses.length ? h("div", { class: "addresses" }, internet.addresses.map((address) => h("div", { class: "address" }, qr(`${address}/`), copyable(`${address}/`, { link: true })))) : null,
        certificate
            ? facts([
                  ["Its certificate's names", certificate.names.join(", ")],
                  ["From", certificate.issuer],
                  ["Runs till", when(certificate.notAfter)],
                  ["Fingerprint (SHA-256)", h("code", { class: "small" }, certificate.fingerprint)],
              ])
            : null,
        h("p", { class: "muted small" }, "On the Wi-Fi, plain http is still taken, and what's sent there isn't encrypted. From the internet, nothing but TLS: never the admin key, nor this page."),
        h("h3", { class: "way-in" }, "A way in"),
        acmePart(internet.acme),
        h(
            "details",
            {},
            h("summary", {}, "A certificate of your own"),
            h("p", { class: "muted small" }, "One for this server's name (or address) from any certificate authority browsers trust. It's checked first: the key must be the certificate's, and it mustn't have run out."),
            own,
            certificate
                ? button(
                      "Take the certificate out",
                      async () => {
                          if (await confirmIt({ title: "Take the certificate out", note: "The server stops answering the internet at once, and anyone in from there is sent out.", go: "Take it out" })) {
                              if (await doing(() => call("DELETE", "/server/certificate"), { status })) {
                                  await renderOverview();
                              }
                          }
                      },
                      "danger",
                  )
                : null,
        ),
        funnelPart(internet.funnel, { sharing }),
        routerPart(internet.router, internet.on),
        internet.on ? testsPart(internet.tests, internet.addresses) : null,
    );
}

async function renderOverview() {
    state.server = await call("GET", "/server");

    const { overview } = state.server;
    const mac = onMac();

    showWho(overview);

    // (From the Wi-Fi, the server's own computer's name for itself is no use)
    const addresses = overview.addresses.filter((address) => mac || !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(address));

    const sections = [
        panel(
            "Where players reach it",
            h("p", { class: "muted" }, "On the same Wi-Fi, players open the game from one of these (a phone can scan its code): the title shows the server's worlds open to anyone, and any they've been in. To invite someone into a world, give them its link: Worlds, the world's Invite players."),
            h(
                "div",
                { class: "addresses" },
                addresses.map((address) => h("div", { class: "address" }, qr(`${address}/`), copyable(`${address}/`, { link: true }))),
            ),
        ),
        nearbyPanel(overview),
        panel(
            "This page",
            h("p", {}, mac ? "You're on the server's own computer: the page needs no key here." : "You're on the server's Wi-Fi, with the admin key."),
            facts([
                ["On the computer", overview.admin ?? "—"],
                ["From the Wi-Fi", `${sharePage()}admin`],
            ]),
            h("p", { class: "muted small" }, "Never from the internet, whatever key is offered."),
        ),
        mac
            ? panel(
                  "The admin key",
                  overview.adminKey
                      ? [h("p", { class: "shown-value" }, overview.adminKey), h("p", { class: "muted small" }, "Shown here, on this computer alone, since it was made while the server's been running. Keep it safe: it manages the server from the Wi-Fi, and makes worlds from the game.")]
                      : h("p", { class: "muted" }, "The admin key was shown in Terminal when it was made. Lost it? Make a new one here: the old one stops working."),
                  button("Make a new admin key", async () => {
                      if (await confirmIt({ title: "A new admin key", note: "The old key stops working at once, wherever it's used.", go: "Make a new one" })) {
                          const made = await doing(() => call("POST", "/server/admin-key", {}));

                          if (made?.key) {
                              showOnce({ title: "The new admin key", note: "Keep it safe: it manages the server from the Wi-Fi, and makes worlds from the game.", value: made.key });
                              renderOverview();
                          }
                      }
                  }),
              )
            : null,
        internetPanel(overview),
        panel(
            "About",
            facts([
                ["Server", h("span", {}, overview.name, h("span", { class: "muted small" }, overview.name === overview.ownName ? " · the computer's own name: Settings gives it another" : ` · its own name (Settings), the computer's ${overview.ownName}`))],
                ["Version", overview.version],
                ["Its id", h("code", {}, overview.id)],
                ["Up for", duration(overview.uptime)],
                ["Started", when(overview.started)],
            ]),
            h("p", { class: "muted small" }, "Its id is what the game checks it by: invite links carry it, so a player's game knows it's reached this server and no other."),
        ),
        panel(
            "Power",
            facts([
                ["Keep the computer awake while players are in", overview.power.keepAwake ? "On" : "Off"],
                ["Now", overview.power.holding ? h("span", { class: "good" }, "Kept awake: players are in") : "Not held awake: nobody's in"],
            ]),
            h("p", { class: "muted small" }, "Sleep stops the server. A laptop on battery, or with its lid closed, may sleep anyway."),
        ),
        panel(
            "Worlds",
            facts([
                ["Kept", String(overview.worlds.kept)],
                ["Running now", `${overview.worlds.going} of ${overview.worlds.atOnce} at once`],
                ["Waiting their turn", String(overview.worlds.waiting)],
            ]),
            h("p", { class: "small" }, overview.recommended.words),
        ),
        overview.blocked.length
            ? panel(
                  "Addresses blocked a while",
                  h("p", { class: "muted" }, "Too many refused requests from these: they're turned away till the time shown."),
                  facts(overview.blocked.map(({ address, until, times }) => [address, `till ${when(until)}${times > 1 ? ` (blocked ${times} times today)` : ""}`])),
              )
            : null,
        mac
            ? panel(
                  "Stopping it",
                  h("p", { class: "muted" }, "Stopping saves every world first (Ctrl+C in Terminal does too). Closing the Terminal window without it may leave worlds unsaved."),
                  button(
                      "Stop the server",
                      async () => {
                          if (await confirmIt({ title: "Stop the server", note: "Everyone playing is sent out, and every world saved. Start it again from Terminal.", go: "Stop it" })) {
                              await doing(() => call("POST", "/server/stop", {}), { done: "Stopping: every world's being saved. Once the Terminal says so, you can close this page." });
                              clearInterval(state.timer);
                          }
                      },
                      "danger",
                  ),
              )
            : null,
    ];

    $("#overview").replaceChildren(...sections.filter(Boolean));
}

// ---- Worlds

async function renderWorlds() {
    const { worlds } = await call("GET", "/server/worlds");

    state.worlds = worlds;

    if (!worlds.length) {
        $("#worlds").replaceChildren(panel("No worlds yet", h("p", { class: "muted" }, "Make one: it's made from its seed when someone first comes in."), button("Make a world", () => show("new"), "primary")));

        return;
    }

    $("#worlds").replaceChildren(h("div", { class: "grid" }, worlds.map(worldCard)));
}

// What a world does with its players' characters (server/storage/worlds.js CHARACTER_RULES), in words
const RULE_WORDS = Object.freeze({
    own: "Made here: the world's own (one taken home leaves it)",
    copies: "Copied in once each: the copy stays here",
    visiting: "Visiting: players bring their own, kept on their devices",
});

// The same, as its owner chooses it
const RULE_CHOICES = Object.freeze([
    ["own", "Made here: characters belong to the world (one taken home leaves it)"],
    ["copies", "Copied in: each character copied in once, the copy staying here"],
    ["visiting", "Visiting: players bring their own, kept on their device as they play"],
]);

function heroesWords(world) {
    return RULE_WORDS[world.characters] ?? RULE_WORDS.own;
}

function worldCard(world) {
    const going = world.life !== "stored" && world.life !== "waiting";

    return h(
        "article",
        { class: "card", dataset: { world: world.id } },
        h("header", {}, h("h3", {}, world.name), h("span", { class: "life", dataset: { life: world.offline && !going ? "offline" : world.life } }, world.offline && !going ? "Offline" : (LIFE_WORDS[world.life] ?? world.life))),
        world.description ? h("p", { class: "small" }, world.description) : null,
        h("p", { class: "muted small words" }, world.words),
        world.players.length ? h("p", { class: "small" }, "In now: ", world.players.map((one) => `${one.name ?? one.player}${one.away ? " (away)" : ""}`).join(", ")) : null,
        facts([
            ["Home people", world.people],
            ["Characters", heroesWords(world)],
            ["Who can join", world.offline ? "Nobody: it's offline" : world.settings.open ? "Anyone who opens the server: no key needed" : "Those with its invite link or a key"],
            ["Listed", world.settings.listed || world.settings.open ? "Yes: anyone can see it" : "No: those with a key alone"],
            ["Most players", String(world.settings.mostPlayers)],
            ["Seed", String(world.seed)],
            ["Made", `${when(world.created)}${world.creator ? `, by ${world.creator}` : ""}`],
            ["Played", duration(world.played)],
            ["Its time", `Day ${world.day}, ${world.hour}`],
            ["On disk", bytes(world.size)],
        ]),
        h(
            "div",
            { class: "actions" },
            button("Play", () => play(world), "primary"),
            button("Invite players", () => invitePlayers(world), "primary"),
            world.offline ? null : going ? button("Set aside", () => lifeOf(world, "aside")) : button("Start", () => lifeOf(world, "start")),
            world.offline ? button("Bring online", () => lifeOf(world, "online"), "primary") : button("Take offline", () => takeOffline(world)),
            going ? button("Save now", () => lifeOf(world, "save")) : null,
            button("Keys", () => openWorld(world.id, "keys")),
            button("Players", () => openWorld(world.id, "players")),
            button("Backups", () => openWorld(world.id, "backups")),
            button("Crash reports", () => openWorld(world.id, "crashes")),
            button("Settings", () => openWorld(world.id, "settings")),
            button("Export", () => doing(() => download(`/worlds/${world.id}/export`), { done: `${world.name} exported: it's in your downloads.` })),
            button("Delete", () => deleteWorld(world), "danger"),
        ),
    );
}

// The world's invite link (server/manage.js invite): one for anyone, to the game on this server at
// its internet address if it has one (else its Wi-Fi's), with the code to scan and what it does; and
// replaced, should it have gone too far
async function invitePlayers(world, { replace = false } = {}) {
    const made = await doing(() => call("POST", `/worlds/${world.id}/invite`, replace ? { replace: true } : {}));

    if (!made) {
        return;
    }

    const again = button("Replace the link", async () => {
        if (await confirmIt({ title: "Replace the invite link", note: `The old link stops letting anyone new into ${world.name}. Everyone who came in by it keeps their place, and can come back as before. Send the new link to anyone still to come.`, go: "Replace it" })) {
            await invitePlayers(world, { replace: true });
        }
    });

    showOnce({
        title: `Invite players to ${world.name}`,
        note: `${replace ? "A new link: the old one lets nobody else in. " : ""}Anyone with this link can join ${world.name} as a player, as many as you send it to. Send it by message or email, or let them scan the code.`,
        link: made.link,
        more: [
            h("p", { class: made.everywhere ? "good" : "warning" }, made.everywhere ? "It works from anywhere: it opens the game at this server's internet address." : "It works only on this Wi-Fi: the server isn't open to the internet. To invite people elsewhere, open it to the internet (Overview, The internet), then make the link again: it'll carry the internet address."),
            h(
                "div",
                { class: "world-help" },
                h("h3", {}, "What they do"),
                h("ol", {}, h("li", {}, "Open the link (or scan the code with a phone's camera). The game opens, from this server."), h("li", {}, "Make a character, if it's their first time: the game takes them through it."), h("li", {}, `They're in ${world.name}. Next time, they open the server's address (or the link again) and carry on.`)),
            ),
            made.open ? h("p", { class: "muted small" }, `${world.name} is open to anyone too: whoever opens the server can join it without the link (its Settings).`) : null,
            h("div", { class: "actions" }, again),
        ].filter(Boolean),
    });
}

// Into a world, as its owner: the game opened on it with an owner's key
async function play(world) {
    await doing(async () => {
        const { keys } = await call("GET", `/worlds/${world.id}/keys`);
        const owner = keys.find((key) => key.role === "owner" && !key.revoked && !(key.expires && Date.parse(key.expires) <= Date.now()));

        if (!owner) {
            throw new Error(`${world.name} has no owner's key that works: issue one under its Keys first.`);
        }

        const { key } = await call("POST", `/worlds/${world.id}/keys/${owner.id}/show`, {});

        window.open(linkTo(world.id, { key }, playPage()), "_blank", "noopener");
    });
}

// A world taken offline for upkeep, asked first: everyone in it sent out, nobody let in, its
// owners neither, till it's brought back online (server/manage.js takeOffline)
async function takeOffline(world) {
    if (await confirmIt({ title: `Take ${world.name} offline`, note: `Everyone in it is sent out, and it's saved and set aside. Nobody may come in, its owners neither, till it's brought back online. While it's offline, what it does with its players' characters can be changed (its Settings).`, go: "Take it offline" })) {
        await lifeOf(world, "offline");
    }
}

async function lifeOf(world, what) {
    const WORDS = {
        start: [`Opening ${world.name}…`, `${world.name} is open.`],
        aside: [`Saving ${world.name}, then setting it aside…`, `${world.name} is set aside: saved, and using nothing.`],
        save: [`Saving ${world.name}…`, `${world.name} is saved.`],
        offline: [`Taking ${world.name} offline…`, `${world.name} is offline: nobody may come in till it's brought back online. What it does with its players' characters can be changed in its Settings now.`],
        online: [`Bringing ${world.name} back online…`, `${world.name} is back online: its players can come in again.`],
    };
    const [saying, said] = WORDS[what];

    say(saying);

    const done = await doing(() => call("POST", `/worlds/${world.id}/${what}`, {}), { done: said });

    if (done) {
        await renderWorlds();
    }
}

async function deleteWorld(world) {
    const yes = await confirmIt({
        title: `Delete ${world.name}`,
        note: "Everyone in it is sent out, and it's gone from the server. A last backup of it is kept in the server's data folder (backups), with its others, but it can't be played again from here.",
        go: "Delete it",
        typed: world.name,
    });

    if (yes && (await doing(() => call("DELETE", `/worlds/${world.id}`, { confirm: world.name }), { done: `${world.name} was deleted.` }))) {
        await renderWorlds();
    }
}

// ---- A world's own dialog: settings, keys, players, backups, crash reports

async function openWorld(id, tab = "settings") {
    state.world = id;
    state.worldTab = tab;
    $("#worldstatus").textContent = "";

    if (!$("#world").open) {
        $("#world").showModal();
    }

    await renderWorld();
}

async function renderWorld() {
    const world = await doing(() => call("GET", `/worlds/${state.world}`), { status: $("#worldstatus") });

    if (!world) {
        return;
    }

    $("#worldname").textContent = world.name;
    $("#worldwords").textContent = world.words;

    for (const tab of document.querySelectorAll("[data-world-tab]")) {
        tab.setAttribute("aria-current", tab.dataset.worldTab === state.worldTab ? "page" : "false");
    }

    const body = await doing(() => WORLD_TABS[state.worldTab](world), { status: $("#worldstatus") });

    if (body) {
        $("#worldbody").replaceChildren(body);
    }
}

function field(label, ...controls) {
    return h("label", { class: "field" }, label, ...controls);
}

function check(name, label, checked) {
    return h("label", { class: "check" }, h("input", { type: "checkbox", name, checked: Boolean(checked) }), label);
}

function select(name, options, value, disabled = false) {
    return h(
        "select",
        { name, disabled },
        options.map(([option, label]) => h("option", { value: option, selected: option === value }, label)),
    );
}

function worldSettings(world) {
    const schema = state.server.worldSchema;
    const going = world.life !== "stored" && world.life !== "waiting";
    const status = h("p", { class: "warning", role: "status" });
    const form = h(
        "form",
        {},
        field("Name", h("input", { name: "name", value: world.name, maxlength: "60", required: true })),
        field("Description", h("textarea", { name: "description", maxlength: "500", rows: "2" }, world.description)),
        h(
            "fieldset",
            {},
            h("legend", {}, "Characters"),
            going ? h("p", { class: "muted small" }, "What it does with its players' characters changes only while nobody's in it: take it offline first (on its card), or set it aside.") : null,
            field("What it does with its players' characters", select("characters", RULE_CHOICES, world.characters, going)),
            h("p", { class: "muted small" }, "Characters a world keeps stay on the server if it's switched to visiting, and are there again if it's switched back. Copies already in a world stay copies."),
        ),
        h(
            "fieldset",
            {},
            h("legend", {}, "Rules"),
            Object.entries(schema).map(([key, setting]) =>
                setting.kind === "boolean" ? check(key, setting.about, world.settings[key]) : field(`${setting.about} (${setting.min} to ${setting.max})`, h("input", { type: "number", name: key, min: String(setting.min), max: String(setting.max), value: String(world.settings[key]) })),
            ),
            h("p", { class: "muted small" }, "A player away 10 minutes is marked away; after 30 they're sent out. Resting always needs everyone there."),
        ),
        status,
        h("button", { type: "submit", class: "primary" }, "Save"),
    );

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const changes = {};
        const settings = {};
        const name = form.elements.name.value.trim();
        const description = form.elements.description.value;

        if (name !== world.name) {
            changes.name = name;
        }

        if (description !== world.description) {
            changes.description = description;
        }

        if (!form.elements.characters.disabled && form.elements.characters.value !== world.characters) {
            changes.characters = form.elements.characters.value;
        }

        for (const [key, setting] of Object.entries(schema)) {
            const value = setting.kind === "text" ? form.elements[key].value.replace(/\s+/g, " ").trim() : setting.kind === "boolean" ? form.elements[key].checked : Number(form.elements[key].value);

            if (value !== world.settings[key]) {
                settings[key] = value;
            }
        }

        if (Object.keys(settings).length) {
            changes.settings = settings;
        }

        if (!Object.keys(changes).length) {
            status.textContent = "Nothing's changed.";

            return;
        }

        if (await doing(() => call("PATCH", `/worlds/${world.id}`, changes), { status, done: "Saved." })) {
            await renderWorld();
            renderWorlds().catch(() => {});
            $("#worldstatus").textContent = "Saved.";
        }
    });

    return form;
}

const works = (key) => !key.revoked && !(key.expires && Date.parse(key.expires) <= Date.now());

async function worldKeys(world) {
    const { keys, codes } = await call("GET", `/worlds/${world.id}/keys`);
    const working = keys.filter(works);
    const labelOf = (id) => keys.find((key) => key.id === id)?.label ?? id;
    const status = h("p", { class: "warning", role: "status" });

    const showKey = async (key) => {
        const shown = await doing(() => call("POST", `/worlds/${world.id}/keys/${key.id}/show`, {}), { status });

        if (shown?.key) {
            showOnce({
                title: key.label,
                note: `Anyone with this key comes in as ${key.role === "owner" ? "an owner" : `a ${key.role}`}. Give them the link (or let them scan it): it opens the game on this server and this world, and their game checks it's reached this server and no other.`,
                value: shown.key,
                link: linkTo(world.id, { key: shown.key }),
            });
        }
    };

    const issue = h(
        "form",
        { class: "row" },
        field("Label", h("input", { name: "label", maxlength: "40", placeholder: "Tuesday group" })),
        field("Part", select("role", ROLES, "player")),
        field("Stops working", h("input", { name: "expires", type: "date" })),
        field("Lets in at most", h("input", { name: "uses", type: "number", min: "1", placeholder: "Any number" })),
        h("button", { type: "submit" }, "Issue a key"),
    );

    issue.addEventListener("submit", async (event) => {
        event.preventDefault();

        const { label, role, expires, uses } = issue.elements;
        const made = await doing(
            () =>
                call("POST", `/worlds/${world.id}/keys`, {
                    label: label.value.trim() || null,
                    role: role.value,
                    ...(expires.value ? { expires: new Date(`${expires.value}T23:59:59`).toISOString() } : {}),
                    ...(uses.value ? { uses: Number(uses.value) } : {}),
                }),
            { status },
        );

        if (made?.key) {
            showOnce({ title: made.record.label, note: `A ${made.record.role}'s key: shown now, and again from this list while it works.`, value: made.key, link: linkTo(world.id, { key: made.key }) });
            await renderWorld();
        }
    });

    const coder = h(
        "form",
        { class: "row" },
        field("Gives the key", select("key", working.map((key) => [key.id, `${key.label} (${key.role})`]), working.find((key) => key.role === "player")?.id)),
        field("Lasts (minutes)", h("input", { name: "minutes", type: "number", min: "15", max: "60", value: "30" })),
        field("Uses", h("input", { name: "uses", type: "number", min: "1", max: "20", value: "1" })),
        h("button", { type: "submit", disabled: !working.length }, "Make a short code"),
    );

    coder.addEventListener("submit", async (event) => {
        event.preventDefault();

        const made = await doing(() => call("POST", `/worlds/${world.id}/codes`, { key: coder.elements.key.value, minutes: Number(coder.elements.minutes.value), uses: Number(coder.elements.uses.value) }), { status });

        if (made?.code) {
            showOnce({
                title: "A short code",
                note: `It gives "${labelOf(made.record.key)}", till ${when(made.record.expires)}, ${made.record.uses === 1 ? "once" : `${made.record.uses} times`}. A player types it in Worlds on servers (Enter a code), or follows the link.`,
                code: made.code,
                link: linkTo(world.id, { code: made.code }),
            });
            await renderWorld();
        }
    });

    return h(
        "div",
        {},
        h("h3", {}, "Keys"),
        h("p", { class: "muted small" }, `Up to 10 work at once. A key revoked or replaced sends out everyone who came in by it; their tickets still say who they are, so with a new key they come back to their heroes.`),
        h(
            "div",
            { class: "table" },
            h(
                "table",
                {},
                h("thead", {}, h("tr", {}, ["Label", "Part", "Made", "Let in", "Stops", ""].map((head) => h("th", {}, head)))),
                h(
                    "tbody",
                    {},
                    keys
                        .slice()
                        .reverse()
                        .map((key) =>
                            h(
                                "tr",
                                { class: works(key) ? "" : "gone", dataset: { key: key.id } },
                                h("td", {}, key.label),
                                h("td", {}, key.role),
                                h("td", {}, when(key.made)),
                                h("td", {}, key.uses === null ? String(key.used) : `${key.used} of ${key.uses}`),
                                h("td", {}, key.revoked ? (key.replacedBy ? "Replaced" : `Revoked ${when(key.revoked)}`) : key.expires ? when(key.expires) : "Never"),
                                h(
                                    "td",
                                    { class: "actions" },
                                    works(key)
                                        ? [
                                              button("Show", () => showKey(key)),
                                              button("Replace", async () => {
                                                  if (await confirmIt({ title: `Replace "${key.label}"`, note: "A new key takes its place (the same label and part); everyone who came in by the old one is sent out, and needs the new one to come back.", go: "Replace it" })) {
                                                      const made = await doing(() => call("POST", `/worlds/${world.id}/keys/${key.id}/replace`, {}), { status });

                                                      if (made?.key) {
                                                          showOnce({ title: made.record.label, note: "The new key, in the old one's place.", value: made.key, link: linkTo(world.id, { key: made.key }) });
                                                          await renderWorld();
                                                      }
                                                  }
                                              }),
                                              button(
                                                  "Revoke",
                                                  async () => {
                                                      if (await confirmIt({ title: `Revoke "${key.label}"`, note: "It stops working at once, and everyone who came in by it is sent out.", go: "Revoke it" })) {
                                                          if (await doing(() => call("DELETE", `/worlds/${world.id}/keys/${key.id}`), { status })) {
                                                              await renderWorld();
                                                          }
                                                      }
                                                  },
                                                  "danger",
                                              ),
                                          ]
                                        : null,
                                ),
                            ),
                        ),
                ),
            ),
        ),
        issue,
        h("h3", {}, "Short codes"),
        h("p", { class: "muted small" }, "Eight letters to read out: each gives one of the keys, once (or a few times), for 15 minutes to an hour."),
        codes.length
            ? h(
                  "div",
                  { class: "table" },
                  h(
                      "table",
                      {},
                      h("thead", {}, h("tr", {}, ["Gives", "Made", "Till", "Used", ""].map((head) => h("th", {}, head)))),
                      h(
                          "tbody",
                          {},
                          codes.map((code) =>
                              h(
                                  "tr",
                                  {},
                                  h("td", {}, labelOf(code.key)),
                                  h("td", {}, when(code.made)),
                                  h("td", {}, when(code.expires)),
                                  h("td", {}, `${code.used} of ${code.uses}`),
                                  h(
                                      "td",
                                      { class: "actions" },
                                      button(
                                          "Revoke",
                                          async () => {
                                              if (await doing(() => call("DELETE", `/worlds/${world.id}/codes/${code.id}`), { status })) {
                                                  await renderWorld();
                                              }
                                          },
                                          "danger",
                                      ),
                                  ),
                              ),
                          ),
                      ),
                  ),
              )
            : h("p", { class: "muted small" }, "None working."),
        coder,
        status,
    );
}

async function worldPlayers(world) {
    const { players } = await call("GET", `/worlds/${world.id}/players`);
    const status = h("p", { class: "warning", role: "status" });
    const act = async (player, what, body = {}, done = "") => {
        if (await doing(() => call("POST", `/worlds/${world.id}/players/${player.id}/${what}`, body), { status, done })) {
            await renderWorld();
        }
    };

    // (By the name they go by, if they've shown their own identity; else the hero they're playing, or have)
    const nameOf = (player) => player.playerName ?? player.name ?? (player.heroes.length ? player.heroes.map((hero) => hero.name).join(", ") : `A player (${player.id})`);

    return h(
        "div",
        {},
        h("p", { class: "muted small" }, "Everyone who's been in, and who's in now. A player's known by the ticket their game was given the first time they came in."),
        players.length
            ? h(
                  "div",
                  { class: "table" },
                  h(
                      "table",
                      {},
                      h("thead", {}, h("tr", {}, ["Player", "Part", "Came by", "First seen", "Last seen", ""].map((head) => h("th", {}, head)))),
                      h(
                          "tbody",
                          {},
                          players.map((player) =>
                              h(
                                  "tr",
                                  { dataset: { player: player.id } },
                                  h("td", {}, h("strong", {}, nameOf(player)), player.here ? h("span", { class: "good small" }, player.away ? " · in, away" : " · in now") : null, world.heroes === "kept" && player.heroes.length ? h("div", { class: "muted small" }, `Heroes: ${player.heroes.map((hero) => hero.name).join(", ")}`) : null, player.identity ? h("div", { class: "muted small player-id", title: "Their own player id, the same on every server" }, `Player id ${player.identity}`) : null),
                                  h(
                                      "td",
                                      {},
                                      player.banned
                                          ? h("span", { class: "bad" }, "Banned")
                                          : (() => {
                                                const part = select("role", ROLES, player.role);

                                                part.addEventListener("change", () => act(player, "role", { role: part.value }, "Their part's changed."));

                                                return part;
                                            })(),
                                  ),
                                  h("td", {}, player.via),
                                  h("td", {}, when(player.made)),
                                  h("td", {}, when(player.seen)),
                                  h(
                                      "td",
                                      { class: "actions" },
                                      player.here ? button("Send out", () => act(player, "kick", {}, `${nameOf(player)} was sent out.`)) : null,
                                      // (Their heroes kept here as a character file, to give them, or keep: app/character-file.js)
                                      world.heroes === "kept" && player.heroes.length ? button("Export heroes", () => doing(() => download(`/worlds/${world.id}/players/${player.id}/heroes`), { status, done: "Their heroes are in the file: any copy of the game brings them in (Characters on this device › Import from a file)." })) : null,
                                      player.banned
                                          ? button("Lift the ban", () => act(player, "unban", {}, "Their ban's lifted."))
                                          : button(
                                                "Ban",
                                                async () => {
                                                    if (await confirmIt({ title: `Ban ${nameOf(player)}`, note: "Their ticket never works here again, and the address they last came from is turned away for a day. You can lift it.", go: "Ban them" })) {
                                                        await act(player, "ban", {}, "Banned.");
                                                    }
                                                },
                                                "danger",
                                            ),
                                      button("New ticket", async () => {
                                          const made = await doing(() => call("POST", `/worlds/${world.id}/players/${player.id}/ticket`, {}), { status });

                                          if (made?.ticket) {
                                              showOnce({
                                                  title: `A new ticket for ${nameOf(player)}`,
                                                  note: "Their old ticket no longer works. Give them this link (or let them scan it): their game takes the new ticket, and they come back as themselves, to their heroes, while the key they last came by works.",
                                                  link: linkTo(world.id, { ticket: made.ticket }),
                                              });
                                          }
                                      }),
                                  ),
                              ),
                          ),
                      ),
                  ),
              )
            : h("p", { class: "muted" }, "Nobody's been in yet."),
        status,
    );
}

async function worldBackups(world) {
    const { backups } = await call("GET", `/worlds/${world.id}/backups`);
    const status = h("p", { class: "warning", role: "status" });

    return h(
        "div",
        {},
        h("p", { class: "muted small" }, "Its latest save and the five before it, one an hour (the last 12), one a day (the last 7), and those made by hand or before something that can't be undone. Restoring sets the world aside, and backs it up as it is first: who may come in, and its journal, stay as they are."),
        h(
            "div",
            { class: "row" },
            button(
                "Back up now",
                async () => {
                    if (await doing(() => call("POST", `/worlds/${world.id}/backups`, {}), { status, done: "Backed up." })) {
                        await renderWorld();
                    }
                },
                "primary",
            ),
        ),
        h(
            "div",
            { class: "row" },
            // (One that can't be carried on: none of its saves reads, or it's older than this version brings forward)
            button("Start it afresh", async () => {
                if (await confirmIt({ title: `Start ${world.name} afresh`, note: "Its land is made again from its seed, as new; its war carries on as far as any save of it reads, and the heroes it keeps are kept. It's backed up as it is first. For a world that can't be carried on: none of its saves reads, or it was saved by a version of the game older than this one can bring forward.", go: "Start it afresh" })) {
                    if (await doing(() => call("POST", `/worlds/${world.id}/afresh`, {}), { status, done: "Started afresh." })) {
                        await renderWorld();
                    }
                }
            }),
        ),
        backups.length ? null : h("p", { class: "muted" }, "None yet: it's first saved when someone first plays in it."),
        h(
            "div",
            { class: "table", hidden: !backups.length },
            h(
                "table",
                {},
                h("thead", {}, h("tr", {}, ["When", "What", "Size", ""].map((head) => h("th", {}, head)))),
                h(
                    "tbody",
                    {},
                    backups.map((backup) =>
                        h(
                            "tr",
                            { dataset: { backup: backup.id } },
                            h("td", {}, when(backup.when)),
                            h("td", {}, backup.kind === "autosave" ? (backup.id === "now" ? "The latest save" : `Autosave ${backup.id.replace("auto-", "")}`) : (WHY[backup.why] ?? backup.why.replace(/-/g, " "))),
                            h("td", {}, bytes(backup.size)),
                            h(
                                "td",
                                { class: "actions" },
                                backup.id === "now"
                                    ? null
                                    : button("Restore", async () => {
                                          if (await confirmIt({ title: `Restore ${world.name}`, note: `To how it was ${when(backup.when)}. Everyone in it is sent out and it's set aside; it's backed up as it is first, so this can be undone.`, go: "Restore it" })) {
                                              if (await doing(() => call("POST", `/worlds/${world.id}/backups/${backup.id}/restore`, {}), { status, done: "Restored." })) {
                                                  await renderWorld();
                                                  renderWorlds().catch(() => {});
                                              }
                                          }
                                      }),
                                button("Download", () => doing(() => download(`/worlds/${world.id}/backups/${backup.id}/download`), { status, done: "Downloaded." })),
                            ),
                        ),
                    ),
                ),
            ),
        ),
        status,
    );
}

// The crash reports its players' games sent as they came back into it after falling over in it
// (server/storage/crashes.js: the last five, newest first), each the game's debug log as it stood
// then: copied all together or one at a time, to send to whoever's looking into them (where the
// browser won't copy, the text shown selected, to copy by hand); and cleared
async function worldCrashes(world) {
    const { crashes } = await call("GET", `/server/worlds/${world.id}/crashes`);
    const status = h("p", { class: "warning", role: "status" });
    const out = h("div", {});
    const copy = async (text, done) => {
        out.replaceChildren();

        try {
            await navigator.clipboard.writeText(text);
            status.textContent = done;
        } catch {
            const area = h("textarea", { class: "copy-out", readOnly: true, rows: 12 });

            area.value = text;
            out.replaceChildren(area);
            area.select();
            status.textContent = "Copying wasn't allowed here: it's selected below to copy yourself.";
        }
    };
    const of = (report) => ({ world: { id: world.id, name: world.name }, ...report });

    return h(
        "div",
        {},
        h("p", { class: "muted small" }, "When a player's game falls over in this world and they come back into it, their game sends what it kept of the crash (its debug log), unless they've turned that off in Game options. The last five are kept with the world."),
        h(
            "div",
            { class: "row" },
            h("button", { type: "button", class: "primary", disabled: !crashes.length, onClick: () => copy(JSON.stringify({ world: { id: world.id, name: world.name }, reports: crashes }, null, 2), crashes.length === 1 ? "Copied the report." : `Copied all ${crashes.length}.`) }, "Copy all"),
            h(
                "button",
                {
                    type: "button",
                    class: "danger",
                    disabled: !crashes.length,
                    onClick: async () => {
                        if (await confirmIt({ title: `Clear ${world.name}'s crash reports`, note: "They're gone from the server for good: copy them first if they're wanted.", go: "Clear them" })) {
                            if (await doing(() => call("DELETE", `/server/worlds/${world.id}/crashes`), { status, done: "Cleared." })) {
                                await renderWorld();
                            }
                        }
                    },
                },
                "Clear",
            ),
        ),
        crashes.length ? null : h("p", { class: "muted" }, "None: no game has fallen over in it and sent one."),
        h(
            "div",
            { class: "table", hidden: !crashes.length },
            h(
                "table",
                {},
                h("thead", {}, h("tr", {}, ["Crashed", "Who", "What", "Code", ""].map((head) => h("th", {}, head)))),
                h(
                    "tbody",
                    {},
                    crashes.map((report) =>
                        h(
                            "tr",
                            { dataset: { crash: report.id } },
                            h("td", {}, when(report.crashed ?? report.received), h("div", { class: "muted small" }, `sent ${when(report.received)}`)),
                            h("td", {}, report.name ?? report.player ?? "—", report.from === "internet" ? h("div", { class: "muted small" }, "from the internet") : null),
                            h("td", {}, report.events?.find((event) => event.kind === "crash")?.summary ?? "A crash", h("div", { class: "muted small" }, `${report.events?.length ?? 0} event${report.events?.length === 1 ? "" : "s"} in its log`)),
                            h("td", {}, h("code", {}, report.code ?? "—")),
                            h("td", { class: "actions" }, button("Copy", () => copy(JSON.stringify(of(report), null, 2), "Copied."))),
                        ),
                    ),
                ),
            ),
        ),
        out,
        status,
    );
}

const WORLD_TABS = { settings: worldSettings, keys: worldKeys, players: worldPlayers, backups: worldBackups, crashes: worldCrashes };

// ---- A new world

function setUpNewWorld() {
    const form = $("#new");

    $("#newrace").replaceChildren(...state.server.peoples.map(({ id, name }) => h("option", { value: id, selected: id === "human" }, name)));

    form.onsubmit = async (event) => {
        event.preventDefault();

        const field = (name) => form.elements[name];
        const seed = field("seed").value.trim();
        const made = await doing(
            () =>
                call("POST", "/worlds", {
                    name: field("name").value.trim(),
                    description: field("description").value,
                    race: field("race").value,
                    characters: field("characters").value,
                    ...(seed ? { seed: Number(seed) } : {}),
                    settings: {
                        mostPlayers: Number(field("mostPlayers").value),
                        listed: field("listed").checked,
                        pauseWhenHidden: field("pauseWhenHidden").checked,
                        trustedMayInvite: field("trustedMayInvite").checked,
                        debugCommands: field("debugCommands").checked,
                    },
                }),
            { status: $("#newstatus") },
        );

        if (!made?.world) {
            return;
        }

        form.reset();
        showKeys(made, `${made.name} is made`);
    };

    // (A world exported from a server, brought in: the file sent as it is, its keys shown as a new world's)
    $("#importbutton").onclick = async () => {
        const file = $("#importfile").files[0];
        const status = $("#importstatus");

        if (!file) {
            status.textContent = "Choose the exported file first (a .json.gz).";
            status.classList.add("bad");

            return;
        }

        const brought = await doing(() => call("POST", "/worlds/import", file, { raw: true }), { status });

        if (!brought?.world) {
            return;
        }

        form.reset();
        showKeys(brought, `${brought.name} is brought in`);
    };
}

/** A world's first keys (made, or brought in), shown once; then the worlds. */
function showKeys(made, title) {
    showOnce({
        title,
        note: "Two keys to start with: the owner's (yours) and the players'. Both are shown again under the world's Keys while they work.",
        more: [
            h("h3", {}, "The owner's key"),
            h("p", { class: "shown-value" }, made.ownerKey),
            h("p", {}, h("a", { href: linkTo(made.world, { key: made.ownerKey }, playPage()), target: "_blank", rel: "noopener" }, "Play it now, as its owner")),
            h("h3", {}, "The players' key"),
            h("p", { class: "shown-value" }, made.playerKey),
            h("div", { class: "address" }, qr(linkTo(made.world, { key: made.playerKey })), copyable(linkTo(made.world, { key: made.playerKey }), { link: true })),
        ],
    });
    show("worlds");
}

// ---- The server's settings, and creator keys

async function renderSettings() {
    state.server = await call("GET", "/server");

    const { settings, schema, overview } = state.server;
    const status = h("p", { class: "warning", role: "status" });

    showWho(overview);

    const form = h(
        "form",
        {},
        Object.entries(schema).map(([key, setting]) =>
            setting.kind === "text"
                ? field(setting.about, h("input", { type: "text", name: key, maxlength: String(setting.most), placeholder: key === "name" ? overview.ownName : "", value: settings[key] }))
                : setting.kind === "boolean"
                ? check(key, setting.about, settings[key])
                : field(
                      `${setting.about} (${setting.min} to ${setting.max})`,
                      h("input", { type: "number", name: key, min: String(setting.min), max: String(setting.max), step: setting.kind === "integer" ? "1" : "0.5", value: String(settings[key]) }),
                      key === "worldsAtOnce" ? h("span", { class: "muted small" }, overview.recommended.words) : null,
                  ),
        ),
        h("p", { class: "muted small" }, "The ports change when the server's next started."),
        status,
        h("button", { type: "submit", class: "primary" }, "Save"),
    );

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const changes = {};

        for (const [key, setting] of Object.entries(schema)) {
            const value = setting.kind === "text" ? form.elements[key].value.replace(/\s+/g, " ").trim() : setting.kind === "boolean" ? form.elements[key].checked : Number(form.elements[key].value);

            if (value !== settings[key]) {
                changes[key] = value;
            }
        }

        if (!Object.keys(changes).length) {
            status.textContent = "Nothing's changed.";

            return;
        }

        const changed = await doing(() => call("PATCH", "/server", { settings: changes }), { status });

        if (changed) {
            await renderSettings();
            say(changed.restart ? "Saved. The ports change when the server's next started." : "Saved.");
        }
    });

    const { creators } = await call("GET", "/server/creators");
    const creatorStatus = h("p", { class: "warning", role: "status" });
    const issue = h("form", { class: "row" }, field("Who it's for", h("input", { name: "label", maxlength: "40", placeholder: "Sam" })), h("button", { type: "submit" }, "Make a creator key"));

    issue.addEventListener("submit", async (event) => {
        event.preventDefault();

        const made = await doing(() => call("POST", "/server/creators", { label: issue.elements.label.value.trim() || null }), { status: creatorStatus });

        if (made?.key) {
            showOnce({ title: `A creator key for ${made.creator.label}`, note: "Shown this once. With it they make worlds of their own on this server, from the game (Worlds on servers, Make a world), and own them.", value: made.key });
            await renderSettings();
        }
    });

    $("#settings").replaceChildren(
        panel("The server's settings", form),
        await updatesPanel(),
        archivePanel(),
        panel(
            "Creator keys",
            h("p", { class: "muted" }, "Whoever holds one makes worlds on this server, and owns them; nothing more."),
            creators.length
                ? h(
                      "div",
                      { class: "table" },
                      h(
                          "table",
                          {},
                          h("thead", {}, h("tr", {}, ["For", "Made", "", ""].map((head) => h("th", {}, head)))),
                          h(
                              "tbody",
                              {},
                              creators.map((creator) =>
                                  h(
                                      "tr",
                                      { class: creator.revoked ? "gone" : "" },
                                      h("td", {}, creator.label),
                                      h("td", {}, when(creator.made)),
                                      h("td", {}, creator.revoked ? `Revoked ${when(creator.revoked)}` : "Works"),
                                      h(
                                          "td",
                                          { class: "actions" },
                                          creator.revoked
                                              ? null
                                              : button(
                                                    "Revoke",
                                                    async () => {
                                                        if (await doing(() => call("DELETE", `/server/creators/${creator.id}`), { status: creatorStatus })) {
                                                            await renderSettings();
                                                        }
                                                    },
                                                    "danger",
                                                ),
                                      ),
                                  ),
                              ),
                          ),
                      ),
                  )
                : h("p", { class: "muted small" }, "None yet."),
            issue,
            creatorStatus,
        ),
    );
}

// ---- The whole server as one archive (server/storage/archive.js)

// "Thornwick: brought forward" and the like, for a world in an archive (manage.js readArchive)
const CARRIES = {
    yes: "carried on as it was",
    afresh: "saved by a version of the game too old to carry on: its land is started afresh from its seed, its war and heroes kept",
    newer: "saved by a newer version of the game: update this server first",
};

// Made (downloaded), or one chosen: what's in it, its worlds brought in as new ones, or restored whole
function archivePanel() {
    const status = h("p", { class: "warning", role: "status" });
    const chosen = h("div", {});
    const file = h("input", { type: "file", accept: ".pellagos-archive,.gz,.json,application/gzip,application/json" });

    const open = async () => {
        if (!file.files[0]) {
            status.textContent = "Choose the archive first (a .pellagos-archive).";
            status.classList.add("bad");

            return;
        }

        const read = await doing(() => call("POST", "/server/archive/read", file.files[0], { raw: true }), { status });

        if (read?.id) {
            chosen.replaceChildren(archiveChosen(read, status));
        }
    };

    return panel(
        "Archive",
        h("p", {}, "The whole server as one file: every world (its saves, the heroes it keeps, who may come in), the server's settings, its admin key and creator keys, and what it proves itself with. Restored, everything's as it was, and players come straight back in with the keys and tickets they have. Not its backups, nor a DNS host's token (give that again)."),
        h("p", { class: "muted small" }, "Keep it as you'd keep a password: whoever has it can stand in for this server. Every world going is saved first."),
        h("div", { class: "row" }, button("Archive everything", () => doing(() => download("/server/archive"), { status, done: "The archive's in your downloads." }), "primary")),
        h("h3", {}, "From an archive"),
        h("p", { class: "muted small" }, "One made by this server or another, by any version: what's older is brought forward as it's opened."),
        h("div", { class: "row" }, h("label", { class: "field" }, "The archive ", file), button("Open it", open)),
        chosen,
        status,
    );
}

// What an archive holds (manage.js readArchive's), its worlds to tick and bring in, or all of it to restore
function archiveChosen(read, status) {
    const ticks = read.worlds.map((world) => h("input", { type: "checkbox", value: world.id, checked: world.carries !== "newer", disabled: world.carries === "newer" }));
    const results = h("div", {});

    const bringIn = async () => {
        const worlds = ticks.filter((tick) => tick.checked).map((tick) => tick.value);

        if (!worlds.length) {
            status.textContent = "Tick the worlds to bring in first.";
            status.classList.add("bad");

            return;
        }

        const brought = await doing(() => call("POST", `/server/archive/${read.id}/worlds`, { worlds }), { status });

        if (brought?.results) {
            results.replaceChildren(
                ...brought.results.map((one) =>
                    one.error
                        ? h("p", { class: "warning bad" }, `${read.worlds.find((world) => world.id === one.from)?.name ?? one.from}: ${one.error}`)
                        : h(
                              "div",
                              { class: "brought" },
                              h("h3", {}, `${one.name} is brought in`),
                              one.salvaged ? h("p", { class: "warning" }, one.salvaged) : null,
                              h("p", { class: "small" }, "The owner's key: ", h("span", { class: "shown-value" }, one.ownerKey)),
                              h("p", { class: "small" }, "The players' key: ", h("span", { class: "shown-value" }, one.playerKey)),
                          ),
                ),
            );
            renderWorlds().catch(() => {});
        }
    };

    const restore = async () => {
        const note = `Everything here is put back as it was in the archive (${read.worlds.length} world${read.worlds.length === 1 ? "" : "s"}): the server starts again to do it, and what's here now is kept in its backups. Its admin key becomes the archive's.`;

        if (await confirmIt({ title: "Restore everything", note, go: "Restore it" })) {
            if (await doing(() => call("POST", `/server/archive/${read.id}/restore`, {}), { status, done: "Restoring: the server's starting again…" })) {
                await afterRestart();
            }
        }
    };

    return h(
        "div",
        { class: "archive" },
        h("p", {}, `Made by Pellagos server ${read.archivedBy ?? "(unknown)"}${read.archived ? `, ${when(read.archived)}` : ""}.`),
        read.worlds.length
            ? h(
                  "ul",
                  { class: "plain" },
                  read.worlds.map((world, k) =>
                      h(
                          "li",
                          {},
                          h("label", { class: "check" }, ticks[k], ` ${world.name}`),
                          h("span", { class: "muted small" }, ` · ${world.players} player${world.players === 1 ? "" : "s"}, ${world.kept} kept hero${world.kept === 1 ? "" : "es"} · ${world.version === null ? "never saved" : CARRIES[world.carries]}`),
                      ),
                  ),
              )
            : h("p", { class: "muted" }, "No worlds in it."),
        h("div", { class: "row" }, button("Bring them in as new worlds", bringIn, "primary"), Object.assign(button("Restore everything", restore), { disabled: !read.restorable })),
        read.restorable ? h("p", { class: "muted small" }, "Restore everything puts the server back as it was. Brought in as new worlds, each gets keys of its own instead.") : h("p", { class: "muted small" }, `Restore everything: ${read.why}`),
        results,
    );
}

// The server started again (restored): this page loaded again once it answers
async function afterRestart() {
    const end = Date.now() + 5 * 60000;

    await new Promise((resolve) => setTimeout(resolve, 3000));

    while (Date.now() < end) {
        try {
            await call("GET", "/server");
            location.reload();

            return;
        } catch {
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
    }
}

// ---- Updates (server/update/updater.js)

const UPDATING = Object.freeze({
    downloading: "Downloading the new version…",
    checking: "Checking it's the project's release…",
    "backing-up": "Backing up every world and the server's settings…",
    unpacking: "Unpacking it beside this one…",
    restarting: "Saving every world, then starting again as the new version…",
});

// The version it is; a newer one, its notes, and Update (or the commands that update a server
// run from a copy of the repository, or Homebrew's); how the last update went; Check now
async function updatesPanel() {
    const updates = await call("GET", "/server/update");
    const status = h("p", { class: "warning", role: "status" });
    const { last, newer, checked } = updates;
    const asked = checked ? `Last asked ${when(checked.at)}${checked.error ? `: ${checked.error}` : "."}` : updates.checks ? "It asks once a day, from a minute after it starts." : "It doesn't ask (its setting's off): check by hand.";
    // (Whether it updates itself overnight: its autoUpdate and updateHour settings, above)
    const clock = (hour) => `${String(hour % 24).padStart(2, "0")}:00`;
    const { overnight } = updates;
    const itself = updates.install.commands
        ? null
        : overnight.on
          ? `New versions install themselves at night, between ${clock(overnight.from)} and ${clock(overnight.from + overnight.hours)} (this computer's time), when nobody's in, with every world backed up first; the computer has to be awake then. Turn it off with "Install new versions by itself", above.`
          : 'New versions wait for you to click Update ("Install new versions by itself", above, is off).';
    const update = async () => {
        const note = [
            "Every world is set aside and backed up first, with the server's settings. Nobody can be in.",
            "The server stops, then starts again as the new version, bringing every world forward. If it can't, it goes back to this version, with everything as it was.",
            onMac() ? 'macOS may ask again whether "node" may accept incoming network connections: allow it.' : "",
        ].join(" ");

        if (await confirmIt({ title: `Update to ${newer.version}`, note, go: "Update" })) {
            if (await doing(() => call("POST", "/server/update", { version: newer.version }), { status })) {
                await followUpdate(newer.version, status);
            }
        }
    };

    return panel(
        "Updates",
        h("p", {}, `This is version ${updates.version}.`),
        last
            ? last.outcome === "updated"
                ? h("p", { class: "muted small" }, `Updated from ${last.from} to ${last.to}, ${when(last.when)}.`)
                : h("p", { class: "warning bad" }, `The update to ${last.to} (${when(last.when)}) didn't start: ${last.why}. It went back to ${last.from}, with every world and the settings as they were.`)
            : null,
        updates.failed ? h("p", { class: "warning bad" }, `The update to ${updates.failed.version} stopped: ${updates.failed.why}`) : null,
        updates.busy ? h("p", { class: "warning" }, UPDATING[updates.busy.stage] ?? "Updating…") : null,
        newer
            ? [
                  h("h3", {}, `Version ${newer.version} is out`),
                  newer.notes ? h("div", { class: "notes" }, newer.notes) : null,
                  newer.page ? h("p", { class: "small" }, h("a", { href: newer.page, target: "_blank", rel: "noopener" }, "Its release page")) : null,
                  updates.install.commands
                      ? [h("p", {}, `This server is run from ${updates.install.kind === "homebrew" ? "Homebrew" : "a copy of the repository"}: update it in Terminal.`), h("pre", { class: "commands" }, updates.install.commands.join("\n"))]
                      : !updates.checkedBy
                        ? h("p", { class: "muted" }, updates.key ? `Version ${newer.version} isn't signed with the project's key, which this server checks new versions with: install it by hand.` : `GitHub doesn't say what version ${newer.version}'s archive should be, so it can't be checked: install it by hand.`)
                        : updates.playersIn
                          ? [h("p", { class: "muted" }, `${updates.playersIn === 1 ? "A player is" : `${updates.playersIn} players are`} in: update when nobody's in, or set their worlds aside.`), button(`Update to ${newer.version}`, update, "primary")]
                          : button(`Update to ${newer.version}`, update, "primary"),
              ]
            : checked && !checked.error
              ? h("p", { class: "muted small" }, "It's the newest version.")
              : null,
        h("p", { class: "muted small" }, asked),
        itself ? h("p", { class: "muted small" }, itself) : null,
        h(
            "div",
            { class: "row" },
            button("Check now", async () => {
                if (await doing(() => call("POST", "/server/update", { check: true }), { status })) {
                    await renderSettings();
                }
            }),
        ),
        status,
    );
}

/** An update followed till it's done: the server restarting as `version`, or why it didn't (said in `status`). */
async function followUpdate(version, status) {
    const end = Date.now() + 15 * 60000;

    while (Date.now() < end) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        let updates;

        try {
            updates = await call("GET", "/server/update");
        } catch (error) {
            // (Its session gone with the server it was made by: signed in again)
            if (error.status === 401) {
                location.reload();

                return;
            }

            status.textContent = "Starting again as the new version…";
            continue;
        }

        if (updates.version === version) {
            await renderSettings();
            say(`Updated to ${version}.`);

            return;
        }

        if (updates.failed?.version === version || (updates.last?.outcome === "rolled-back" && updates.last.to === version && !updates.busy)) {
            await renderSettings();
            say(`The update to ${version} didn't go: see Updates.`, { bad: true });

            return;
        }

        status.textContent = UPDATING[updates.busy?.stage] ?? "Updating…";
    }
}

// ---- What's happened

async function renderActivity() {
    const { activity } = await call("GET", "/server/journal");
    const shown = $("#activityfrom")?.value ?? "";
    const from = h("select", { id: "activityfrom" }, h("option", { value: "" }, "Everything"), h("option", { value: "server", selected: shown === "server" }, "The server"), [...new Map(activity.filter((entry) => entry.world).map((entry) => [entry.world, entry.name]))].map(([id, name]) => h("option", { value: id, selected: shown === id }, name)));
    const list = (filter) =>
        h(
            "ol",
            { class: "activity" },
            activity.filter((entry) => !filter || (filter === "server" ? !entry.world : entry.world === filter)).map((entry) => h("li", {}, h("time", { datetime: entry.when }, when(entry.when)), h("span", { class: "who" }, entry.name), h("span", {}, entry.text))),
        );

    const holder = h("div", {}, list(shown));

    from.addEventListener("change", () => holder.replaceChildren(list(from.value)));
    $("#activity").replaceChildren(panel("What's happened", h("div", { class: "row" }, field("From", from), button("Again", () => renderActivity())), h("p", { class: "muted small" }, "Players coming in and leaving, keys, saves and backups, the admin's doings: newest first."), holder));
}

// ---- How it's keeping up

async function renderHealth() {
    const health = await call("GET", "/server/health");
    const ms = (value) => (value === null || value === undefined ? "—" : `${value.toFixed(1)} ms`);

    $("#health").replaceChildren(
        panel(
            health.health === "ok" ? "All's well" : "Slow",
            h("p", { class: health.health === "ok" ? "good" : "bad" }, health.health === "ok" ? "Every world going is keeping up." : "A world's steps are falling behind (its slowest 1% take over 50 ms): fewer worlds at once, or fewer players, would help."),
            health.worlds.length
                ? h(
                      "div",
                      { class: "table" },
                      h(
                          "table",
                          {},
                          h("thead", {}, h("tr", {}, ["World", "Now", "Players", "Step (mean)", "Slowest 1%", "Worst", "Memory", "Its save"].map((head) => h("th", {}, head)))),
                          h(
                              "tbody",
                              {},
                              health.worlds.map((world) =>
                                  h(
                                      "tr",
                                      {},
                                      h("td", {}, world.name),
                                      h("td", {}, LIFE_WORDS[world.life] ?? world.life),
                                      h("td", {}, `${world.players}${world.present !== world.players ? ` (${world.present} present)` : ""}`),
                                      h("td", {}, ms(world.steps?.mean)),
                                      h("td", { class: world.slow ? "bad" : "" }, ms(world.steps?.p99)),
                                      h("td", {}, ms(world.steps?.worst)),
                                      h("td", {}, bytes(world.memory ? world.memory.heap + world.memory.external : null)),
                                      h("td", {}, bytes(world.save)),
                                  ),
                              ),
                          ),
                      ),
                  )
                : h("p", { class: "muted" }, "No world's going: every one is set aside, using nothing."),
        ),
        panel(
            "The server and its computer",
            facts([
                ["The server's memory", `${bytes(health.server.rss)} (its own heap ${bytes(health.server.heap)})`],
                ["The computer's memory", `${bytes(health.machine.memory)}, ${bytes(health.machine.free)} free`],
                ["Its load", health.machine.load.map((load) => load.toFixed(2)).join(", ") + ` (over 1, 5 and 15 minutes; ${health.machine.cores} cores)`],
                ["Up for", duration(health.server.uptime)],
            ]),
        ),
    );
}

// ---- The sections

const RENDER = { overview: renderOverview, worlds: renderWorlds, new: async () => {}, settings: renderSettings, activity: renderActivity, health: renderHealth };

// (Shown again every so often, while they're on screen: not the forms)
const LIVE = new Set(["overview", "worlds", "health"]);

async function show(tab) {
    state.tab = tab;

    for (const item of document.querySelectorAll("[data-tab]")) {
        item.setAttribute("aria-current", item.dataset.tab === tab ? "page" : "false");
    }

    for (const section of document.querySelectorAll("main > .tab")) {
        section.hidden = section.id !== tab;
    }

    await doing(() => RENDER[tab]());
}

function refresh() {
    clearInterval(state.timer);
    state.timer = setInterval(() => {
        // (Nor while a form on it's open: what's been typed or chosen there kept)
        if (document.hidden || $("#world").open || $("#confirm").open || $("#shown").open || !LIVE.has(state.tab) || document.querySelector(`#${state.tab} details[open]`)) {
            return;
        }

        RENDER[state.tab]().catch((error) => say(error.message, { bad: true }));
    }, REFRESH);
}

// From the Wi-Fi: the admin key asked for, and traded for a session
function signIn(why = "") {
    $("#tabs").hidden = true;

    for (const section of document.querySelectorAll("main > .tab")) {
        section.hidden = true;
    }

    $("#signin").hidden = false;
    $("#signinstatus").textContent = why;
    $("#who").textContent = "From the Wi-Fi";
    $("#signinkey").focus();
}

async function open() {
    try {
        state.server = await call("GET", "/server");
    } catch (error) {
        if (error.error === "csrf") {
            say("The server's been started again since this page was opened: reload it.", { bad: true });

            return;
        }

        if ([401, 403].includes(error.status)) {
            state.session = null;
            sessions.set(null);
            signIn(error.error === "home" ? error.message : "");

            return;
        }

        say(error.message, { bad: true });

        return;
    }

    const { overview } = state.server;

    $("#signin").hidden = true;
    $("#tabs").hidden = false;
    showWho(overview);
    say("");
    setUpNewWorld();
    await show(state.tab);
    refresh();
}

// Who's being managed, at the top: the server's name (as it is now), its version, and from where
function showWho(overview) {
    $("#who").textContent = `${overview.name} · version ${overview.version} · ${overview.mac ? "on this computer" : "from the Wi-Fi"}`;
}

function start() {
    for (const tab of document.querySelectorAll("[data-tab]")) {
        tab.addEventListener("click", () => show(tab.dataset.tab));
    }

    for (const tab of document.querySelectorAll("[data-world-tab]")) {
        tab.addEventListener("click", () => {
            state.worldTab = tab.dataset.worldTab;
            renderWorld();
        });
    }

    $("#worldclose").addEventListener("click", () => {
        $("#world").close();
        renderWorlds().catch(() => {});
    });
    $("#shownclose").addEventListener("click", () => $("#shown").close());

    $("#signin").addEventListener("submit", async (event) => {
        event.preventDefault();

        const key = $("#signinkey").value.trim().toUpperCase();
        const answer = await doing(() => call("POST", "/server/session", {}, { key }), { status: $("#signinstatus") });

        if (answer?.session) {
            state.session = answer.session;
            sessions.set(answer.session);
            $("#signinkey").value = "";
            await open();
        }
    });

    // (A copy of the page somewhere else, GitHub Pages say, is no server's)
    if (location.hostname.endsWith("github.io")) {
        say("This page is a world server's own: open it from the server, at localhost:8481 on its computer, or /admin at its address on the Wi-Fi.", { bad: true });

        return;
    }

    state.session = sessions.get();
    open();
}

start();
