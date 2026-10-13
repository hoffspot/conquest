// Tailscale's command for the tests (generated/world_server_plan.md §9.4), answering as the real
// one does: `status --json` (the backend's state, this computer's name), `serve status --json` and
// `funnel status --json` (what's served at its name, and whether Funnel's on there), `funnel --bg
// --https=443 [--yes] <target>` and `funnel --https=443 off`. It can be missing, signed out, on a
// tailnet that hasn't allowed Funnel (it says where to allow it, then waits, as the real one does
// till it's killed), serving something else already, or too old for --yes.

/**
 * A fake `run` (as platform/ tailscale gives it): `installed`, `backend` (Tailscale's state:
 * "Running", "NeedsLogin", "Stopped"...), `name` (this computer's on the tailnet), `allowed`
 * (Funnel allowed on the tailnet), `served` (a target something else is served at already),
 * `old` (no --yes). Records `calls` (each as its arguments joined), and `target` (what Funnel
 * serves now, or null); `allowed` can be changed as it runs (Funnel allowed in the meantime).
 */
export function fakeTailscale({ installed = true, backend = "Running", name = "studio-mac.tail1234.ts.net", allowed = true, served = null, old = false } = {}) {
    const ok = (stdout = "") => ({ ok: true, stdout, stderr: "", timedOut: false });
    const json = (value) => ok(JSON.stringify(value));
    const fake = async (args) => {
        fake.calls.push(args.join(" "));

        if (!installed) {
            return { missing: true };
        }

        const [command, ...rest] = args;
        const serving = () =>
            fake.target
                ? { TCP: { 443: { HTTPS: true } }, Web: { [`${name}:443`]: { Handlers: { "/": { Proxy: fake.target } } } }, AllowFunnel: fake.funnel ? { [`${name}:443`]: true } : {} }
                : {};

        if (command === "status") {
            return json({ BackendState: backend, Self: backend === "Running" ? { DNSName: `${name}.`, Online: true } : { DNSName: "" }, AuthURL: backend === "NeedsLogin" ? "https://login.tailscale.com/a/1a2b3c4d" : "" });
        }

        if ((command === "serve" || command === "funnel") && rest[0] === "status") {
            return json(serving());
        }

        if (command === "funnel" && rest.includes("off")) {
            fake.target = null;
            fake.funnel = false;

            return ok();
        }

        if (command === "funnel") {
            if (old && rest.includes("--yes")) {
                return { ok: false, stdout: "", stderr: "flag provided but not defined: -yes\nUSAGE\n  tailscale funnel <target> {on|off}\n", timedOut: false };
            }

            if (!fake.allowed) {
                return { ok: false, stdout: "Funnel is not enabled on your tailnet.\nTo enable, visit:\n\n         https://login.tailscale.com/f/funnel?node=nX1y2Z3\n\n", stderr: "", timedOut: true };
            }

            fake.target = rest.at(-1);
            fake.funnel = true;

            return ok(`Available on the internet:\n\nhttps://${name}/\n|-- proxy ${fake.target}\n\nFunnel started and running in the background.\n`);
        }

        return { ok: false, stdout: "", stderr: `unknown command: ${command}\n`, timedOut: false };
    };

    return Object.assign(fake, { calls: [], target: served, funnel: Boolean(served), allowed });
}
