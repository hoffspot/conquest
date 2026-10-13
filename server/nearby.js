// Nearby servers on the Wi-Fi (generated/world_server_plan.md §8.2). The server advertises itself
// with Bonjour (`_pellagos._tcp`, its TXT record carrying its id, name, version, NET_VERSION, play
// port and how many worlds it lists), and browses for the others, which its status lists under
// `nearby`: browsers can't browse Bonjour, so a player who reaches any one server on the Wi-Fi
// sees the rest through it.
//
// Bonjour is the platform layer's (platform/: macOS's own tool, Avahi's on Linux), and an extra:
// macOS asks its Local Network permission for it, which serving players doesn't need. Refused, or
// its tool stopping, it says why (for the management page) and tries again a minute later; play
// carries on all the while. The server's `bonjour` setting turns it on and off as it runs.

import dns from "node:dns";
import { cardOfTxt, txtOf } from "./platform/index.js";

/** How long after a refusal, or Bonjour's tool stopping, it tries again (ms). */
export const RETRY = 60000;

/** A changed TXT record is advertised again at most this often (ms): every change makes the others look it up again. */
export const SETTLE = 10000;

/** How often it looks whether what it advertises has changed (ms). */
export const CHECK = 30000;

/** The most nearby servers it lists (a busy network's rest left out). */
export const MOST_NEARBY = 32;

const sameName = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

export class Nearby {
    /**
     * @param {object} options
     * @param {object|null} options.bonjour - The machine's Bonjour (platform/ bonjour()), or a fake responder's; null for none (it's never on).
     * @param {function} options.card - What it advertises, as it is now: { id, name, version, net, port, worlds }.
     * @param {function} [options.lookup] - A host's IPv4 address (dns.promises.lookup's way).
     * @param {function} [options.onChange] - Told when what it shows changes.
     */
    constructor({ bonjour, card, lookup = (host) => dns.promises.lookup(host, { family: 4 }), onChange = () => {}, retry = RETRY, settle = SETTLE, check = CHECK, clock = () => Date.now() }) {
        Object.assign(this, { bonjour, card, lookup, onChange, retry, settle, check, clock });

        /** Whether it's meant to be on (the setting, and a Bonjour to have). */
        this.on = false;

        /** The name it's advertised under, once the responder's said so; and why not, if it's been refused. */
        this.advertised = null;
        this.refused = null;

        this.advert = null;
        this.browser = null;
        this.txt = null;
        this.present = new Set();
        this.found = new Map();
        this.timers = { retry: null, settle: null, check: null };
    }

    /** On or off, as the server's `bonjour` setting says. */
    follow(wanted) {
        return wanted ? this.start() : this.stop();
    }

    /** Advertising, and browsing for the others. */
    start() {
        if (this.on || !this.bonjour) {
            return this;
        }

        this.on = true;
        this.#advertise();
        this.#browse();
        this.timers.check = setInterval(() => this.refresh(), this.check);
        this.timers.check.unref?.();

        return this;
    }

    /** Neither: what it found forgotten. */
    stop() {
        this.on = false;
        this.advert?.stop();
        this.browser?.stop();
        this.advert = this.browser = null;
        this.advertised = this.refused = this.txt = null;
        this.present.clear();
        this.found.clear();

        for (const [key, timer] of Object.entries(this.timers)) {
            clearTimeout(timer);
            clearInterval(timer);
            this.timers[key] = null;
        }

        return this;
    }

    /** What it advertises looked at again: advertised anew (after SETTLE) if it's changed. */
    refresh() {
        if (!this.on || !this.advert || this.timers.settle || txtOf(this.card()).join(" ") === this.txt) {
            return;
        }

        this.timers.settle = setTimeout(() => {
            this.timers.settle = null;

            if (this.on && this.advert && txtOf(this.card()).join(" ") !== this.txt) {
                this.advert.stop();
                this.#advertise();
            }
        }, this.settle);
        this.timers.settle.unref?.();
    }

    /** How it is, for the management page: { on, available, as (the name it's shown under), refused: { code, message } }. */
    state() {
        return { on: this.on, available: Boolean(this.bonjour), as: this.advertised, refused: this.refused };
    }

    /** The servers found nearby (never itself): [{ name, id, version, net, worlds, address ("host:port"), ip ("a.b.c.d:port", or null), seen }], by name. */
    list() {
        return [...this.found.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Whether a page's origin is one of the nearby servers' own (by the address it was found at,
     * or its IPv4 address): the game they serve plays on this server too (guards.js). An exact
     * match, never a pattern.
     */
    allows(origin) {
        if (typeof origin !== "string") {
            return false;
        }

        for (const near of this.found.values()) {
            if (origin === `http://${near.address.toLowerCase()}` || (near.ip && origin === `http://${near.ip}`)) {
                return true;
            }
        }

        return false;
    }

    #advertise() {
        const card = this.card();
        const txt = txtOf(card);
        const advert = this.bonjour.advertise({ name: card.name, port: card.port, txt });

        this.advert = advert;
        this.txt = txt.join(" ");
        advert.on("registered", (name) => {
            this.advertised = name;
            this.refused = null;
            this.onChange();
        });
        advert.on("refused", (why) => this.#lost("advert", why));
        advert.on("ended", (why) => this.#lost("advert", why));
    }

    #browse() {
        const browser = this.bonjour.browse();

        this.browser = browser;
        browser.on("found", (seen) => this.#seen(seen));
        browser.on("lost", ({ name }) => {
            this.present.delete(name);

            if (this.found.delete(name)) {
                this.onChange();
            }
        });
        browser.on("refused", (why) => this.#lost("browser", why));
        browser.on("ended", (why) => this.#lost("browser", why));
    }

    // Its advertising or browsing ended (refused, or its tool stopped): said, and tried again later
    #lost(which, why) {
        if (!this.on) {
            return;
        }

        this[which] = null;

        if (which === "advert") {
            this.advertised = null;
        } else {
            this.present.clear();
            this.found.clear();
        }

        // (A refusal is kept to show; a tool that merely stopped isn't one)
        this.refused = why?.code && why.code !== "ended" ? why : this.refused;
        this.onChange();

        if (!this.timers.retry) {
            this.timers.retry = setTimeout(() => {
                this.timers.retry = null;

                if (this.on) {
                    this.refused = null;
                    this.advert ?? this.#advertise();
                    this.browser ?? this.#browse();
                }
            }, this.retry);
            this.timers.retry.unref?.();
        }
    }

    // A server seen (resolved here if the tool didn't as it browsed): listed, if it's a Pellagos
    // server and not this one
    async #seen({ name, host, port, address, txt }) {
        if (sameName(name, this.advertised)) {
            return;
        }

        this.present.add(name);

        let where = host ? { host, port, txt } : null;

        try {
            where ??= await this.bonjour.resolve(name);
        } catch {
            return;
        }

        const card = cardOfTxt(where.txt);

        if (!card || card.id === this.card().id || !this.present.has(name) || !this.on) {
            return;
        }

        let ip = address ?? null;

        if (!ip) {
            try {
                ip = (await this.lookup(where.host))?.address ?? null;
            } catch {
                ip = null;
            }
        }

        if (!this.present.has(name) || (!this.found.has(name) && this.found.size >= MOST_NEARBY)) {
            return;
        }

        const shown = (one) => (one.includes(":") ? `[${one}]` : one);

        this.found.set(name, {
            name: card.name ?? name,
            id: card.id,
            version: card.version,
            net: card.net,
            worlds: card.worlds,
            address: `${where.host}:${where.port}`,
            ip: ip ? `${shown(ip)}:${where.port}` : null,
            seen: new Date(this.clock()).toISOString(),
        });
        this.onChange();
    }
}
