// A session in a replicated world recorded for the tests (generated/multiplayer_scaling_plan.md
// 3-32): a world hosted here, in step with nothing and over links that take no time, two games
// sent views of it, and one of them recorded (client/js/core/recording.js) through what a
// player does: coming in, walking, going into the tavern and out again, fighting a bandit out in
// the town, the page hidden a while and shown. What it took and did is kept, gzipped, as
// test/fixtures/views/<n>.json.gz, which test/recording.test.js plays again with no server and
// holds to what it came to here.
//
//     npm run record:view            # the recording test/recording.test.js reads, made again
//     npm run record:view -- --out /tmp/session.json.gz --seed 7
//
// Made again when a view's bytes are read another way (VIEW_VERSION, NET_VERSION), or when what
// a game makes of them is meant to change: the test says which, and that this is how.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import { STEP_MS } from "../client/js/core/battle.js";
import { Host } from "../client/js/core/host.js";
import { Hosting } from "../client/js/core/netplay.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { Recorder, spanOf } from "../client/js/core/recording.js";
import { Viewing } from "../client/js/core/viewing.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the recording the tests read is kept. */
export const VIEW_FIXTURE = path.join(ROOT, "test/fixtures/views/1.json.gz");

const character = (name) => ({ hero: { name, shape: {}, look: {}, weapon: "sword", boots: false, race: "human" }, progress: { gold: 50, skills: { blade: 300 } } });

/**
 * A session recorded: resolves to the recording (core/recording.js Recorder.take). The same
 * for the same `seed`: nothing in it goes by the wall's clock.
 */
export function recordView({ seed = 2 } = {}) {
    const host = new Host(buildWorld({ seed }), { populate: false });
    const games = new Map();
    let now = 0;
    const hosting = new Hosting(host, {
        send: (peer, text) => games.get(peer)?.hear(text),
        sendBinary: (peer, bytes) => games.get(peer)?.frame(Uint8Array.from(bytes)),
    });

    host.join({ id: "host", hero: { name: "Host", shape: {}, look: {}, weapon: "sword", boots: false } });
    host.populate();
    hosting.session.netcode = "replicated";
    hosting.views.mode = "on";

    const come = (peer, who, recorded) => {
        const link = new Viewing({ send: (text) => hosting.hear(peer, text), clock: () => now });
        const recorder = recorded ? new Recorder(link, { clock: () => now }) : null;

        games.set(peer, link);
        link.onWelcome = (welcome) => link.attach(new Host(buildWorld({ seed: welcome.seed, race: welcome.race }), { populate: false }), welcome);
        link.hello(who);

        return { link, recorder };
    };
    const ann = come("a", character("Ann"), true);
    const bob = come("b", character("Bob"), false);
    // The world played `steps` on: each game playing what's come, as a game does each frame, and
    // asking how long a word takes every second
    const play = (steps = 1) => {
        for (let k = 0; k < steps; k++) {
            now += STEP_MS;
            hosting.views.heard(host.advance(STEP_MS));
            hosting.flush();

            for (const link of games.values()) {
                while (link.host && link.step()) {
                    // (Everything that's come, played)
                }

                if (link.me && Math.round(now / STEP_MS) % 20 === 0) {
                    link.ping();
                }
            }
        }
    };
    const { link } = ann;
    const mine = () => host.battle.actor(link.me);
    const until = (done, most = 600) => {
        for (let k = 0; k < most && !done(); k++) {
            play();
        }
    };

    play(40);
    link.ready();

    // Walking; Bob walking by
    link.command({ type: "move", to: [Math.floor(mine().x) + 6, Math.floor(mine().y) + 3], run: true });
    bob.link.command({ type: "move", to: [Math.floor(mine().x) + 2, Math.floor(mine().y) - 4] });
    play(60);

    // (Out in the open, where she's walked to: where the bandit's to come)
    const open = [...mine().square];

    // Into the tavern, and out again
    link.command({ type: "enter", link: "tavern-door", run: true });
    until(() => mine().map === "taproom");
    play(40);
    link.command({ type: "enter", link: "tavern-door", run: true });
    until(() => mine().map === "town");
    play(20);

    // A fight: a bandit come at her out in the town, set on till he falls
    host.battle.add({ id: "bandit", kind: "player", weapon: "sword", team: "bandits", map: "town", square: [open[0] + 3, open[1] + 1], hp: 60 });
    play(10);
    link.command({ type: "engage", target: "bandit", lock: true });
    until(() => host.battle.actor("bandit")?.dead ?? true, 400);
    link.command({ type: "unlock" });
    link.command({ type: "stop" });
    play(20);

    // The page hidden a while, as a phone's is, and shown: the view asked for again
    link.away(true);
    play(60);
    link.away(false);
    play(60);

    return ann.recorder.take();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { values } = parseArgs({ options: { out: { type: "string" }, seed: { type: "string" } } });
    const out = values.out ? path.resolve(values.out) : VIEW_FIXTURE;
    const recording = recordView({ seed: Number(values.seed ?? 2) });
    const packed = gzipSync(JSON.stringify(recording), { level: 9 });
    const { ms, frames } = spanOf(recording);

    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, packed);
    console.log(`${path.relative(ROOT, out)}: ${recording.events.length} events over ${(ms / 1000).toFixed(1)} s, ${frames} frames, ${(packed.length / 1024).toFixed(0)} KB gzipped; it came to ${recording.end.known.length} known of at step ${recording.end.played}, ${recording.end.faults.length} faults, its view told again ${recording.end.resyncs} time(s)`);
}
