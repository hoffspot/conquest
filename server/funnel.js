// Tailscale Funnel (generated/world_server_plan.md §9.4): the way in when no router can let the
// internet in (a provider sharing one address between homes, CGNAT: router.js says so). Tailscale's
// own servers take the internet's connections at https://<this computer>.<tailnet>.ts.net (port
// 443, with Tailscale's certificate) and bring them through the tailnet to the server's tunnel
// listener, on this computer alone (127.0.0.1:8482: world-server.js), which takes them as the
// internet's: keys needed, never the management page (guards.js).
//
// While the internet's answered and the `funnel` setting's on, Tailscale's command (platform/
// tailscale) is asked, in turn: `status --json` (installed, running, signed in, and this
// computer's name on the tailnet); `serve status --json` (nothing else served there already);
// then `funnel --bg --https=443 --yes http://127.0.0.1:8482`. It's let go (`funnel --https=443
// off`) when the internet's no longer answered or the server stops, if it's still the server's.
// A tailnet that hasn't allowed Funnel yet says where to allow it, and the page shows that link.
// Looked at again every 10 minutes (Tailscale may have been quit or signed out); after a failure,
// after 1, 5, then 30 minutes.

import { tailscale as platformTailscale } from "./platform/index.js";

/** How long a command may take (ms), how often it's looked at again, and how long it waits after failing. */
export const FUNNEL_TIMES = Object.freeze({ command: 15000, look: 10 * 60 * 1000, retry: [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000] });

/** Where Funnel takes the internet's connections (Tailscale offers 443, 8443 and 10000). */
export const FUNNEL_PORT = 443;

/** Why Funnel can't be had, by what's wrong (Tailscale's own states, or "missing"). */
export const FUNNEL_REFUSALS = Object.freeze({
    missing: "Tailscale isn't installed on this computer. Install it (tailscale.com/download; on a Mac, Homebrew's open-source client works too), sign in, then ask again.",
    NeedsLogin: "Tailscale isn't signed in on this computer: open it and sign in, then ask again.",
    NeedsMachineAuth: "This computer is waiting to be approved in Tailscale's admin console.",
    Stopped: "Tailscale is turned off on this computer: turn it on, then ask again.",
    other: "Tailscale isn't running on this computer: start it, then ask again.",
});

// Where Tailscale says to go to allow something (Funnel, the tailnet's certificates) or sign in
const ALLOW = /https:\/\/(?:login\.tailscale\.com\/[af]\/|tailscale\.com\/s\/)[^\s"']+/;

/** Funnel refused: what's wrong, and where Tailscale says it's put right (`allow`), if it says. */
export class FunnelError extends Error {
    constructor(message, { allow = null } = {}) {
        super(message);
        this.allow = allow;
    }
}

// A command's first line of complaint
const complaintOf = ({ stdout = "", stderr = "" }) =>
    `${stderr}\n${stdout}`
        .split("\n")
        .map((line) => line.trim())
        .find(Boolean) ?? "";

export class Funnel {
    /** For `server` (world-server.js: its tunnelPort, reachChanged()). `run` (Tailscale's command) and `clock` for the tests. */
    constructor(server, { run = platformTailscale(), clock = Date.now } = {}) {
        Object.assign(this, { server, run, clock });
        this.on = false;
        this.working = null;
        this.timer = null;
        this.tries = 0;
        this.reset();

        /** Told each time it's asked Tailscale, and how it went (server/world.js says so in Terminal). */
        this.onChange = null;
    }

    reset() {
        Object.assign(this, { name: null, open: false, served: null, error: null, allow: null, retryAt: null, checkedAt: null });
    }

    /** What Tailscale's asked to serve: the tunnel listener. */
    target() {
        return `http://127.0.0.1:${this.server.tunnelPort}`;
    }

    /** Where the internet reaches the server through it (null if it doesn't). */
    get url() {
        return this.open && this.name ? `https://${this.name}` : null;
    }

    /** How it stands, for the management page. */
    state() {
        return {
            on: this.on,
            working: Boolean(this.working),
            open: this.open,
            name: this.name,
            url: this.url,
            port: this.server.tunnelPort,
            error: this.error,
            allow: this.allow,
            retryAt: this.retryAt ? new Date(this.retryAt).toISOString() : null,
            checkedAt: this.checkedAt ? new Date(this.checkedAt).toISOString() : null,
        };
    }

    /** Asked for or not (`on`: the internet's answered and the `funnel` setting's on); asked again when it was on and `again`. */
    follow(on, { again = false } = {}) {
        if (!on) {
            this.on = false;

            return this.close();
        }

        // (Asked already, for the tunnel as it is now: nothing to ask again)
        if (this.on && !again && (this.working || (this.open && this.served === this.target()))) {
            return this.working ?? Promise.resolve(this.state());
        }

        this.on = true;

        return this.#start();
    }

    /** Asked again, now (the owner asks, after allowing Funnel or signing in). */
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
                this.server.reachChanged?.();
                this.onChange?.(this.state());
            });

        return this.working;
    }

    // Tailscale's answer to `args`, as JSON; throws FunnelError
    async #json(args) {
        const done = await this.run(args, { timeout: FUNNEL_TIMES.command });

        if (done.missing) {
            throw new FunnelError(FUNNEL_REFUSALS.missing);
        }

        if (!done.ok) {
            throw new FunnelError(`Tailscale wouldn't say how it stands: ${complaintOf(done) || "it failed."}`, { allow: ALLOW.exec(`${done.stdout}${done.stderr}`)?.[0] ?? null });
        }

        try {
            return JSON.parse(done.stdout);
        } catch {
            throw new FunnelError("Tailscale's answer couldn't be read.");
        }
    }

    // What Tailscale serves at this computer's name on Funnel's port already (a proxy's target, or a
    // TCP forward's), from `serve status --json`; null if nothing
    #servedAt(serve, name) {
        const proxy = serve?.Web?.[`${name}:${FUNNEL_PORT}`]?.Handlers?.["/"]?.Proxy;
        const forward = serve?.TCP?.[String(FUNNEL_PORT)]?.TCPForward;

        return proxy ?? (forward ? `tcp://${forward}` : null);
    }

    async #turnOn() {
        const args = ["funnel", "--bg", `--https=${FUNNEL_PORT}`, "--yes", this.target()];
        let done = await this.run(args, { timeout: FUNNEL_TIMES.command });

        // (An older Tailscale, without --yes)
        if (!done.ok && !done.missing && /flag provided but not defined: -+yes/.test(done.stderr)) {
            done = await this.run(
                args.filter((arg) => arg !== "--yes"),
                { timeout: FUNNEL_TIMES.command },
            );
        }

        if (done.missing) {
            throw new FunnelError(FUNNEL_REFUSALS.missing);
        }

        if (!done.ok) {
            const allow = ALLOW.exec(`${done.stdout}\n${done.stderr}`)?.[0] ?? null;

            throw new FunnelError(allow ? `Funnel isn't allowed for this computer on its tailnet yet: allow it at ${allow}, then ask again.` : `Tailscale wouldn't: ${complaintOf(done) || (done.timedOut ? "it didn't answer in time." : "it failed.")}`, { allow });
        }
    }

    async #open() {
        const before = this.served;

        this.reset();

        if (!this.on) {
            return this.state();
        }

        try {
            const status = await this.#json(["status", "--json"]);

            if (status.BackendState !== "Running") {
                throw new FunnelError(FUNNEL_REFUSALS[status.BackendState] ?? FUNNEL_REFUSALS.other, { allow: status.AuthURL || null });
            }

            const name = String(status.Self?.DNSName ?? "")
                .replace(/\.$/, "")
                .toLowerCase();

            if (!name) {
                throw new FunnelError("Tailscale gave this computer no name: turn MagicDNS on in Tailscale's admin console, then ask again.");
            }

            this.name = name;

            const served = this.#servedAt(await this.#json(["serve", "status", "--json"]).catch(() => null), name);

            // (What it served itself before, at another port, is its own to replace)
            if (served && served !== this.target() && served !== before) {
                throw new FunnelError(`Tailscale already serves something else at https://${name} (${served}). Take that off (tailscale funnel --https=${FUNNEL_PORT} off), then ask again.`);
            }

            await this.#turnOn();

            const funnel = await this.#json(["funnel", "status", "--json"]).catch(() => null);

            if (funnel && !funnel.AllowFunnel?.[`${name}:${FUNNEL_PORT}`]) {
                throw new FunnelError("Tailscale serves the server to the tailnet alone, not to the internet: Funnel isn't on for it.");
            }

            Object.assign(this, { open: true, served: this.target(), checkedAt: this.clock() });
            this.tries = 0;
            this.timer = setTimeout(() => this.on && this.#start(), FUNNEL_TIMES.look);
            this.timer.unref?.();
        } catch (error) {
            this.#failed(error);
        }

        return this.state();
    }

    #failed(error) {
        const wait = FUNNEL_TIMES.retry[Math.min(this.tries, FUNNEL_TIMES.retry.length - 1)];

        this.tries++;
        this.open = false;
        this.error = { message: error.message, at: new Date(this.clock()).toISOString() };
        this.allow = error.allow ?? null;
        this.retryAt = this.clock() + wait;
        this.checkedAt = this.clock();
        this.timer = setTimeout(() => this.on && this.#start(), wait);
        this.timer.unref?.();
    }

    /** Let go: Funnel turned off, if what it serves is still the server's (the internet's no longer answered, or the server's stopping). */
    async close() {
        clearTimeout(this.timer);
        await this.working?.catch(() => {});

        const { open, name } = this;

        this.reset();

        if (open && name) {
            const serve = await this.#json(["serve", "status", "--json"]).catch(() => undefined);
            const served = serve === undefined ? this.target() : this.#servedAt(serve, name);

            if (served === this.target()) {
                await this.run(["funnel", `--https=${FUNNEL_PORT}`, "off"], { timeout: FUNNEL_TIMES.command }).catch(() => {});
            }
        }

        this.server.reachChanged?.();

        return this.state();
    }
}
