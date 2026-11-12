# Contributing to Pellagos with Claude Code

This is how to set up Claude Code in your own account so it can work on this game, run the same
checks CI runs, and open a pull request that's safe to merge. It's written for a person and for
Claude: point Claude Code at this file before it starts (the repository's `CLAUDE.md` does this for
you in every session).

## The standing rule: keep this document current

> **contribution.md is part of the development pipeline.** Any change to how the game is set up,
> built, tested, checked or merged updates this document in the same pull request. That includes:
> `package.json`'s scripts or Node version; anything in `.github/workflows/`;
> `playwright.config.js`, `eslint.config.js`, `e2e/fixtures.js` or how the browser tests are split;
> `scripts/`; the tools in `utilities/` and their checks; the rules for the version numbers; the branch, review and merge conventions; what
> an environment needs to run the checks; and the repository's settings on GitHub (section 6,
> *The repository's settings*). A pull request that changes the pipeline without updating this
> file isn't ready to merge.
>
> **Only the owner (hoffspot) can change the repository's settings.** When a change needs one
> changed (a new rule for `main`, a secret; not a CI job added, renamed or removed, nor a
> different number of browser test jobs: `ci` is the one required check, section 6, *One
> required check*), say so to the owner, with the exact steps, in the pull request and in
> your session. Update the settings table in section 6 in the same pull request, and check that
> the owner has made the change before it's merged. Whenever a setting is changed or added, the
> table is updated to match.

The rule is written down three times, so no one can miss it:

- here;
- in `CLAUDE.md`, which Claude Code reads at the start of every session in this repository;
- in `test/contribution.test.js`. It fails when an npm script, a workflow, a CI job, when CI
  runs, the time a job is ended at or the Node version changes and this file hasn't been updated
  to match; when CI's `ci` job doesn't wait for every other job, or a share of the browser tests
  isn't exactly one job's; and when the required checks in the settings table are neither `ci`
  alone nor every other job by its name. That test is the part of the rule a machine can check;
  everything else is up to you and your reviewer.

## What you need

- A GitHub account.
- Claude Code: the command line, the desktop app, or Claude Code on the web
  (<https://claude.ai/code>). It runs on your own Claude plan, so its usage is yours.
- Node.js 22 or newer (`package.json`'s `engines`; CI uses 22, and not yet 26: section 2, *Which
  Node*).
- Chromium for the browser tests. Playwright downloads it, or you point it at one you already
  have with `CHROMIUM_PATH`.
- Only for the licensed models (the Dreadthorn's, the werewolf's, the centipede's, the Ant
  Monster's, the ant's, the two spiders', the scorpion's, the cockroach's, the wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', the infernal demon's, the stone golem's, the orcs', the kaiju's, the cerberus's, the Demon Boss's, the Order of the Bell's and its Prior's, the horses', Bellhaven's, the White Castle's, the timber forts' and the shop furniture's, Wind Ways', the taverns', halls', temples', smithies', shops' and dungeons' furniture's and the heroes' shields' and swords', Dragon Motion's, and the town houses' kit's, Meshsmith Foundry's): access to the private repository
  `hoffspot/conquest-models`, which the owner gives, then `npm run models:fetch`. Without it the
  game draws the stand-ins, the model viewer can't show those models, and the few tests that need their models say they're left out. CI always has them (`docs/LICENSED_MODELS.md`).

Nothing in this pipeline costs money. CI runs on GitHub's free runners for this public
repository, and the game needs no paid services. The builds use the owner's secrets (the
settings table, section 6), set in the repository's settings, never in its files. Never add a
secret to the repository or to a pull request.

## 1. Get the code where Claude can reach it

The repository is public: <https://github.com/hoffspot/conquest>.

- **Without write access (most contributors):** fork it on GitHub, and have Claude Code work on
  your fork. Your pull requests go from your fork's branch to `hoffspot/conquest`'s `main`.
- **With write access** (ask the owner, hoffspot): work on a branch of your own in the
  repository. Never push to `main`.

### Claude Code on the web (a cloud session)

1. Connect GitHub to Claude: <https://claude.ai/connect-github>. If the Claude GitHub App isn't
   installed on your fork (or on the repository, if you have write access), install it from that
   page.
2. Create a cloud environment for the repository (in claude.ai/code, from the environment menu;
   the steps are at <https://code.claude.com/docs/en/cloud-environments>):
   - **Network access:** any level that lets the package managers through (the default does).
     `npm ci` needs the npm registry; nothing else is fetched.
   - **Setup script:** `npm ci`
   - **Environment variables:** `CHROMIUM_PATH=/opt/pw-browsers/chromium`. Chromium is already
     installed in Claude's cloud containers. Don't have Claude run `npx playwright install`
     there.
3. Start a session with your fork (or your branch) selected and give it the task. Ask it to
   follow `contribution.md`.

### Claude Code on your own computer (the command line or desktop app)

```sh
git clone https://github.com/<you>/conquest.git   # your fork
cd conquest
npm ci                                            # exactly the versions in package-lock.json
npx playwright install chromium                   # once; or set CHROMIUM_PATH instead
npm start                                         # http://localhost:8080 (PORT=3000 for another port)
```

Then run `claude` in the folder. Claude Code asks before running commands and before editing
files. Read what it wants to do, above all a `git push`.

## 2. The checks: what CI runs, and how to run them yourself

CI (`.github/workflows/ci.yml`) runs on every pull request, and by hand (the Actions tab, CI,
*Run workflow*, on any branch). A pull request's run is cancelled when you push to it again; only
its newest commit's run counts. A run by hand always runs to the end.

**CI doesn't run on `main` when a pull request is merged.** `main`'s ruleset (section 6, *The
repository's settings*) lets a pull request in only with its required checks green on a head
that's up to date with `main`, so what the merge makes of `main` is, file for file, what that run
tested. For each of the 60 merges before this was decided (2026-11-11), the merge commit's tree
was its branch head's. Tested again on `main`, those runs were a third of all CI's runs. They
held half of GitHub's 20 jobs at a time for most of an hour after every merge, while the next
pull request waited, and one in four failed, always on a test that fails now and then, never on
a fault. This rests on two of the ruleset's rules, *Require status checks to pass* and *Require
branches to be up to date before merging*: if either is ever turned off, `push: branches: [main]`
goes back into `ci.yml` first.

**How long it takes.** Every job is given about the same work: 19 minutes of it as the tests
were last timed (2026-11-11: 234 minutes of browser tests between 12 `e2e` jobs and the
`motion` job; the unit tests' own 22 minutes are more than a share, so the `test` job runs none
of them). The first run with the browser tests drawn cheaply, still on 8 `e2e` jobs, ended 36
minutes in. The table below is from before both changes, 8 `e2e` jobs each given 41 minutes,
over 43 green runs, 9 to 11 November 2026: time the jobs again once a few dozen runs have
passed as they are now, and put the new figures here:

| | Median | From, to | Of which |
| --- | --- | --- | --- |
| `test` | 46½ minutes | 28 to 51½ | lint 20 seconds, the unit tests 22 minutes (13½ to 23½), its share of the browser tests 24 |
| `motion` | 43 | 25 to 49 | the motion check 13 (7½ to 14½), its share of the browser tests 30 |
| an `e2e` job | 41 | 23 to 57½ | getting ready 20 seconds, the rest its share of the browser tests |
| A run, start to end | 52½ | 41 to 70 | its slowest job, and any wait for a runner |

The jobs are given the same work and still end far apart, because GitHub's runners come at three
speeds, 1.7 times apart, and about half are the slowest: a run ends with its slowest job, a
median 23 minutes after its fastest. GitHub also runs no more than 20 jobs at a time for the
whole account, so two runs fill it and a third waits its turn.

A job that hangs is ended rather than held to GitHub's 6 hours: `test`, `motion` and each `e2e`
job at 80 minutes, about twice the work each is given (the longest any has taken is 57½; the
Chromium download in each is tried three times, 5 minutes a try), and `ci` at 5.

**Which Node.** CI, Pages, the soak and the nightly scale run use Node 22; the Mac app's workflow and the Mac app itself,
24 (`NODE` in `scripts/build-mac-app.js`). Node 26 has been the long-term-support release since
28 October 2026, Node 22's support ends in April 2027, and on the game's own code 26 took 15%
less of a processor's time making and stepping a world, so the move is wanted. It was tried on
2026-11-11 and isn't made yet, for one test:

- The whole unit suite on Node 26.13.0 passed but for `test/registry.test.js`, *giving back its
  memory*: a world set aside ends its thread, and the test looks for most of what two worlds took
  to be back with the system a second later. It fails every time on Node 26.13.0 and on Node
  24.21.0, and passes every time on Node 22.23.4, each run alone on the same machine.
- Measured there, on Linux: two worlds take about 260 MB on Node 22, 340 MB on Node 24 and
  360 MB on Node 26. Once their threads end, Node 22 gives back 82% at once. Node 24 gives back
  83%, 3 to 10 seconds later. Node 26 had given back 14% after 45 seconds: it keeps the rest for
  the next worlds (run and ended four times over, the process held about as much each time) and
  lets go of it only now and then.

So a world server's memory behaves differently on the newer Nodes, most likely the Mac app's
among them (its Node is the same release, for a Mac), and whether that's the server's to change
or the test's is the owner's call. Before moving any workflow or `NODE` to another Node, run the
whole suite on it (`<that node> --test --test-concurrency=3 test/*.test.js`), or at the least
that file.

| CI job | What it runs | Locally |
| --- | --- | --- |
| `test` | the licensed models fetched (below), `npm ci`, then `npm run lint` (ESLint) and `npm test` (Node's test runner, `test/*.test.js`, three files at a time); then its share of the browser tests (the last share, below) | `npm run check`, which runs both |
| `e2e` (12 jobs side by side) | the licensed models fetched, then each job's share of the Playwright browser tests (`e2e/*.spec.js`: shares 1 to 12, below) | `npm run test:e2e`, or only the tests you touched (below) |
| `motion` | `npm run check:motion`: the motion check (below), failing on anything worse than its baseline. Its report is kept with the run as `motion-report`. Then its share of the browser tests (the last share but one, with the licensed models) | `npm run check:motion` |
| `ci` | Nothing of its own. It waits for every job above, whatever becomes of them, and passes only if each one passed (not failed, cancelled or skipped); its log says how each ended. It's there to be the one check `main`'s ruleset requires (section 6, *One required check*) | All of the above |

**The browser tests' shares.** They're split fourteen ways, by how long each took on CI
(`scripts/e2e-shard.js`, `e2e/durations.json`): a share for each `e2e` job, and one each for the
`motion` and `test` jobs once their own work's done, given that much less (`ci.yml`'s
`E2E_SHARES` and `E2E_AHEAD`: `last-1:13,last:20`, the minutes each does first), so that every job
is given about the same work. Those two take the last two shares however many there are (`last-1` and
`last`, which the action makes numbers), so `E2E_SHARES` is always the `e2e` jobs and two more.
Each job runs its share with `.github/actions/e2e-share` (Chromium installed, the
share chosen and run), and its JSON report is kept with the run as `e2e-report-<share>`, failed
or not: how long each test took there, to time them by (below). If the unit tests or the motion
check take much longer or shorter, change their minutes in `E2E_AHEAD`.

**What a failed browser test leaves.** When a job's browser tests fail, Playwright's
`test-results/` folder is kept with the run for 14 days as `e2e-failures-<share>` (the run's
page, Artifacts, or `gh run download <run> -p 'e2e-failures-*'`). It has a folder for each test
that failed, with Playwright's own note of it (`error-context.md`: the error, and an outline of
what was on the page as it ended) and whatever else `playwright.config.js` has it keep of a
failure, such as a picture of the page. `<share>` is the job's: an `e2e` job's own number, and
the two after the last of those for `motion` and `test`.

**The licensed models** (`docs/LICENSED_MODELS.md`) are kept in the private repository
`hoffspot/conquest-models`. Every job that needs them starts with `.github/actions/licensed-models`:
it checks that repository out into `.models` with the read-only deploy key (its private half the
secret `MODELS_DEPLOY_KEY`), and puts its files in place under `client/`, each checked against the
hash and size the catalog keeps (`scripts/licensed-models.js`). From then on, the tests that need
one fail if it's missing (`LICENSED_MODELS=required`); elsewhere they say they're left out. A
fork's pull request is given no secrets, so its run leaves them out, with a notice; anywhere else,
no key fails the job. A maintainer brings a fork's pull request into a branch here before it's
merged.

`.github/workflows/pages.yml` runs when `main` changes: the licensed models fetched, then
`npm run build:manifest`. It copies `client/`, and in the copy alone takes the comments and
indentation out of the game's code, puts a source map beside each file, and makes the manifest
and the page's import map again, so every hash is of the file as the site serves it
(`scripts/build-site.js`, which refuses the repository's own `client/`; `npm start`, the tests
and the Mac app keep the code as it's written). Then it writes into the copy which code it is,
for the debug log: the commit and the time, in place of `client/js/app/version.js`'s noughts
(`scripts/stamp-version.js`, after the manifest's made; as kept in the repository, the game says
it's "dev"). Then it publishes the copy to GitHub Pages
(<https://hoffspot.github.io/conquest/>); its build is ended at 10 minutes (it takes under one)
and its deploy at 15 (under two).
It tests nothing: lint and the unit tests have just passed on the pull request, on the very files
merged (above), and run again here they kept the site waiting 17 minutes. So whatever is merged
to `main` goes live a minute or two later, and the pull request's checks are all that stand
between a change and the players. Its `npm ci` installs nothing the build needs: it keeps npm's
cache on `main`, where every pull request's run can take it from.

`.github/workflows/soak.yml` is the cross-engine soak (`npm run soak`, below). It's run by hand
from the Actions tab (Soak, Run workflow: how many minutes, the seed, which browsers), and for
three minutes on a pull request that changes the soak itself (`scripts/soak.js`,
`client/js/core/bot.js` or the workflow). It installs Chromium, WebKit and Firefox with their
system libraries, keeps its report with the run as `soak-report`, and is ended at 30 minutes on a
pull request and 4 hours by hand. It isn't a required check: most pull requests never run it.

`.github/workflows/scale.yml` measures the world authority as its players grow
(generated/multiplayer_scaling_plan.md 0-4): `npm run load` at 8 players spread, 8 fighting in one
town, 25 four to a town, 25 spread, 50 with sticks held and 100 in one town, then
`npm run soak:server` with 4 players and 25 thin ones for ten minutes (both below). It runs every
night (03:17 UTC), by hand from the Actions tab (Scale, Run workflow: the seed, how long each load
plays, how long the soak), and on a pull request that changes what it runs (`scripts/load.js`,
`scripts/server-soak.js`, `client/js/core/probe.js`, `client/js/core/bot.js` or the workflow):
there, the first three loads for 30 seconds each and a two-minute soak of 1 and 12. It keeps its
reports with the run as `scale-reports` and is ended at 60 minutes. It isn't a required check, and
no time in it is a gate: a hosted runner's clock differs by half from one machine to the next. It
fails only by what's the same on any machine (a run that can't be made, players who didn't stay in,
a report not as its schema says) or a mean step over 50 ms, which no working world reaches
(`--ceiling 50`); the plan's gates are timed by hand on the owner's Mac. A scheduled workflow runs
from `main` only, and GitHub turns one off after 60 days in which the repository has had no
commit: *Actions → Scale → Enable workflow* turns it on again.

`.github/workflows/mac.yml` builds the world server's Mac app on a Mac (a public repository's Mac
runners cost nothing): the menu-bar app (`mac/`, Swift), put in its bundle with Node, the server
and the installer (which its **Uninstall…** runs) and signed ad hoc (`npm run build:mac`, below), numbered as a release would be (`package.json`'s
major and minor and the count of the commits, `2.0.4123`, in the copy it builds) and its game
stamped with the commit (`scripts/stamp-version.js`, as the Pages deploy stamps it); then it opens
the app, finds its item in the menu bar (`mac/ci/status-item.swift`), sees its server answer on
port 8480, quits it and checks every world was saved first; runs the installer
(`scripts/install-mac.sh`) as a Mac's owner would, each way it installs (a zip marked as
downloaded, a release, built there), and takes it away again: the app alone (`--keep-data`), its
data folder kept, then, a world made on its management page, everything it keeps, that world
saved first to an archive the server reads; and installs the Homebrew
formula from a tap of its own and runs its test. The licensed models are fetched first, so the
app's game has them. It runs on a pull request that changes `mac/`, `scripts/build-mac-app.js`,
`scripts/install-mac.sh`, how the server's started and updated (`server/world.js`, `serve.js`,
`launch.js`, `server/update/`), `server/platform/`, the workflow or the licensed models' step
(`.github/actions/licensed-models/`); on `main` when a merge changes what the app holds (`client/`, `server/`, `mac/`, `package.json`,
`scripts/build-mac-app.js`, `scripts/stamp-version.js`, `LICENSE` or the workflow), one run at a
time; and by hand (Mac app, Run workflow). It keeps the zip, the server's archive (signed with the
project's key when the repository has it as the Actions secret `PELLAGOS_RELEASE_KEY`:
`npm run release-key`, below) and the formula with the run as `pellagos-server-mac` (and pictures
of the screen, its menu open and the app the installer put in, as `mac-screen`), and is ended at 30
minutes. On `main` (pushed to or run by hand there), its `release` job then publishes them as a
GitHub release, `server-v<version>`: the zip, which the installer installs, and the server's
archive (and its signature), which servers update to, with notes from the pull requests merged since
the release before; it checks GitHub keeps a SHA-256 for each (the installer and servers check
against it), keeps the newest ten releases and takes older ones away with their tags, and is ended
at 15 minutes (docs/SERVER.md, "Releasing"). `test/install-mac.test.js` runs the installer here,
with stand-ins for the Mac's own tools (`curl`, `osascript`, `codesign`, `ditto`, `security`, ...)
that note how they're asked, a terminal's answers given in a file (`PELLAGOS_TTY`); it never reaches the internet. Neither of its jobs is a required check (`release` never runs on a pull request), but
a pull request that runs it is merged only once it's green: nothing else compiles the Swift. This
container has no Swift; the app's own checks on a Mac (first launch, the firewall's and Local
Network's prompts, run at login, sleep, its menu's **Uninstall…**) are the owner's (docs/MAC_APP.md).

### Every npm script

| Script | When to run it |
| --- | --- |
| `npm start` | Serves the game and the multiplayer relay (kept for one release: a world server's broker takes its place) on port 8080. Open `/?play` to go straight into a game (`&seed=12`, `&people=elf`, `&hero=1` for another body of the same seed, `&quality=low`, `medium` or `high` for this load alone; `&flyin` for the opening fly-in, which it leaves out; `&measure=<name>&minutes=12`, on this or any other link into a game, for a measured run: every frame counted and a report left, docs/GAME.md, *Measuring a device*) |
| `npm run dev` | The same, restarting the server when its code changes |
| `npm run world-server` | The world server (`generated/world_server_plan.md`), on port 8480: worlds kept on the server, run in threads of their own, reached from the Wi-Fi, and from the internet over TLS alone once it has a certificate and **Answer the internet** is on (its `internet` setting; a certificate of the owner's own is put in on the management page, or as `certificates/server.key` and `server.crt` in its data folder; or the server gets free ones from Let's Encrypt itself, set up on the management page: a DuckDNS name, a domain on Cloudflare or deSEC, or the home's IP address, with the DNS host's token kept in the Keychain on macOS, elsewhere in `certificates/tokens.json`. Its tests use a certificate authority of their own, `test/fake-acme.js`, and never reach Let's Encrypt or a DNS host; while it answers the internet it asks the home's router to forward its port (PCP, NAT-PMP or UPnP; **Ask the router** in Settings), and its tests ask a router of their own, `test/fake-router.js`, never the machine's real one; or, for a home whose provider shares its address, it lets the internet in through Tailscale Funnel (**Tailscale Funnel** on the management page, its `funnel` setting: Tailscale installed and signed in on the computer, Funnel allowed on the tailnet), which brings it to a tunnel listener on `127.0.0.1:8482`; its tests use a Tailscale of their own, `test/fake-tailscale.js`, never the machine's). `-- --port 9000 --data /tmp/worlds` for another port and data folder. The first start prints its admin key, once. Its management page is at `http://localhost:8481` on the same computer, needing no key (`-- --admin 9001` for another port; its metrics, as Prometheus reads them, are at `/metrics` there and nowhere else: docs/SERVER.md, *Metrics*), and at `/admin` on the play port from the Wi-Fi, with the admin key: its worlds (made, started, set aside, backed up, restored, exported, deleted), their keys, codes and players, the crash reports and measured runs their players' games sent, its settings, what's happened, and its health. It shows itself to other servers on the Wi-Fi with Bonjour (macOS's `dns-sd`, or `avahi-utils` with avahi-daemon on Linux; its `bonjour` setting), and lists those it finds, which players add from **Worlds on servers** with a tap; macOS may ask for Local Network permission, and play carries on if it's refused. Worlds can also be made from the game it serves (the title's **Worlds on servers**: add the server, then Make a world), and the game's **Test this server** there tries its internet addresses from wherever the device is and tells the server's page how that went (from a phone on its cellular data, the page's code opens the game and tests it at once). A world a player opens to others from the game's menu (**Invite others**) goes through the server's broker (`/broker`): listed there if they like, and joined point to point (WebRTC), or relayed by the server when that can't be made (its `broker` and `relaying` settings); the tests use a WebRTC of their own, `test/fake-rtc.js`. Beside what it says for people, it prints its structured log on the same output, a line of JSON for each thing that happens (docs/SERVER.md, *Logs*; `test/log.test.js` holds that no line carries a key, a ticket, a session, a token or a whole address: a new kind of line gets its fields from `FIELDS` in `server/log.js`, never a new field for a secret). `-- --app` runs it as the Mac app does (`mac/`, docs/MAC_APP.md): how it stands said on `@pellagos` lines, and stopped, every world saved, when its input closes. `server/world.js` is its launcher (`server/launch.js`): it runs the server itself (`server/serve.js`) as this version or a newer one an update installed in the data folder, starts it again after an update, and goes back to the version before if the new one fails. Updates are the management page's (Settings, Updates: a new version found once a day among the releases the Mac app workflow publishes, checked against GitHub's SHA-256 for its archive, or signed with the project's key where the server has its public half, installed when its owner clicks, or by itself overnight when nobody's in, its `autoUpdate` and `updateHour` settings; a copy of the repository is shown `git pull` instead); `-- --releases <url> --release-key <file>` looks for them elsewhere, as the tests do. A world exported from a server is brought in on the page's New world. The whole server is one archive (Settings, Archive; `server/storage/archive.js`): made, and restored in place of everything on a server with no worlds, or its worlds brought in as new ones (one too old to carry on started afresh from its seed). `-- --archive <file>` makes one from the data folder (the server stopped), and `-- --restore <file>` stages one to be put in place when it next starts (`--replace` where there are worlds). The owner's guide is docs/SERVER.md |
| `npm test` | Every change. The unit tests take about 20 minutes on four cores, an hour of one core's work (22 minutes on CI, 13½ to 23½ as its runner comes). Each test file runs in a process of its own; a world's plan one of them has laid out is kept under `node_modules/.cache/pellagos-plans/` for the next to read back (`test/plan-cache.js`: kept by its seed and a hash of the planner's code, so a change to the planner starts again; CI never restores the folder, so it always lays plans out afresh; `PLAN_CACHE=off` lays every one out afresh here too). A test file still running after 20 minutes is ended and named |
| `npm run test:affected` | While working on a change: every unit test, as `npm test` runs them, but those the change can reach by imports first, then those that read files or start processes, then the rest (`scripts/test-affected.js`; `-- --list` only says the order). A failure shows in minutes; a pass is as much of one as `npm test`'s |
| `npm run lint` | Every change. ESLint must be clean. It keeps a cache (`.eslintcache`, not committed): a file is linted again only when its bytes have changed, so a second run takes a second |
| `npm run check` | Lint and the unit tests together: run it before every push |
| `npm run test:e2e` | Changes to the game in the browser: the screens, controls, HUD, drawing, multiplayer |
| `npm run check:motion` | Changes to how characters move or what they're built from: the body, bones, joints, walking, attacks, rests, items, clothes (below). About 13 minutes on four threads (7½ to 14½ on CI's runners) |
| `npm run balance` | Changes to how the wild answers the players' side, to whom it goes for (its enmity: docs/WILDS.md *Whom they go for*), or to how strong players, hirelings or creatures are: the balance runner (docs/WILDS.md, *Tuning it*), each side's fights at tiers 2, 5 and 8 (camped first, a player who falls out of that fight), with each side's share of what one alone loses beside its aim, and what its allies bore of the wild's blows (`borne`, `drawn`). A few minutes; `-- --tiers 5 --sides solo,four` for less. A fight goes one way or another by what's about, so a retune takes many: `-- --seeds 2,3,4,5,6,7,8,9 --fights 8` is 64 a side (each world's dice the same every run, so two settings are told apart on the very same fights) |
| `npm run snapshot-fixture` | After bumping `SNAPSHOT_VERSION` (section 4): a snapshot of a world as the new version keeps it, `test/fixtures/snapshots/<version>.json.gz`, for `test/snapshots.test.js` to bring forward and play on. A few seconds |
| `npm run step-budget` | Changes to the rules' steps, the navigation, or what's made ahead on the world server (`server/ahead.js`): a world stepped on Node as the world server will step it, four players walking about in four peoples' towns, every step timed. It fails if any step takes longer than a step (50 ms) of its thread's own processor time, so it says the same on a busy machine (the clock's times are said beside it), or if what the world server's thread counts of each step for its metrics (`server/world-metrics.js`) costs 0.05 ms a step or more (it costs under a thousandth of one). About half a minute; `-- --seconds 600` for longer, `-- --field 50` with a field battle of 50 a side begun ten seconds in, `-- --no-ahead` to compare without making anything ahead |
| `node --test test/budget.test.js` | Changes to the rules' passes that measure the world against its players (`#lookAround`, `#spotting`, `#muster`, `#townsfolk`, `#wilds`, the players' groups, the battle's index): one of the unit tests, so `npm test` and CI run it, named here because it's a budget and not a behaviour (generated/multiplayer_scaling_plan.md 0-5). It plays ten seconds of a world with 50 players spread, nothing drawn or sent, and holds the work each pass counts (`client/js/core/probe.js`) to a budget: counts, not times, so it says the same on any machine. Over a budget, look for a pass measuring everything against everyone again. A budget is brought down when its pass gets cheaper (the test fails one left more than half as much again above what's counted) and raised only when the world itself has grown, saying so there. About 45 seconds |
| `npm run load` | Changes to what a step of the world costs with many players in it, or to what's sent them: the rules' relevance passes, the battle, netplay's flush, snapshots (generated/multiplayer_scaling_plan.md 0-2). A world on Node stepped and opened as the world server does it, all in one process, with players joined over a link that only counts what they're sent (they hold no copy of the world, so 100 cost no more than the authority's own work), played in fixed steps: the same options play the same world every time. It reports each pass of the step by name (`client/js/core/probe.js`), the step's mean, 99th percentile and worst by the clock and in the thread's processor time, bytes a second sent each player and by kind, a snapshot's size and the time to take and write it, and memory; it judges nothing and fails only on an option it doesn't know. `-- --players 8` (the default), `25`, `50` or `100`; `--layout spread` (each in a settlement of their own), `towns` (four to a town) or `one-town`; `--activity walk`, `stick`, `fights`, `battle` (200 a side), `invasion` or `hellrift` (`night`, `warturn`, `joinstorm` and `dungeons` are named and say they aren't built yet); `--seconds 120`; `--seed 2` (the plan's tables use 2 and 7); `--json`; `--ceiling 50` to fail, as the nightly run does (`.github/workflows/scale.yml`), if players were sent out, a fight asked for didn't begin, the report isn't as its schema says, or the mean step took more than 50 ms of the thread's time. The default run takes about 20 seconds, 25 spread about a minute. More than eight players spread want more navigation tiles round them than the 1,024 the navigation keeps: the run says so (`navigation.capped`) and its steps include the tiles baked again. Its report is written to `test-results/load/report.json` (`--out` for elsewhere); `test/load.test.js` holds it to its schema |
| `npm run soak` | Changes to how the copies of a world keep to its host's: the rules' steps, netplay, the runner, what's made ahead (generated/world_server_plan.md §3.3). A world on Node with no host player, and players who play by themselves joined to it (`client/js/core/bot.js`) in Node, Chromium, WebKit and Firefox, each in their own people's town, starting fights; and one doing nothing, to be marked away and sent out. It fails if any copy is sent the world again once a player-hour or more, or sees anyone marked away or sent out at another step than the host. 32 minutes by default; `-- --minutes 5 --browsers chromium` for a quick look, `-- --browsers none` for Node's alone. WebKit and Firefox need `npx playwright install webkit firefox` first; `CHROMIUM_PATH` uses a Chromium you have. Its report is written to `test-results/soak/report.json` |
| `npm run soak:server` | Changes to how the world server runs a world for its players: the world's thread, the play socket, saving, what's made ahead (generated/world_server_plan.md §15 S9). A world server with 8 players in Node, each in a process of its own, playing by themselves (`client/js/core/bot.js`), for two hours. It fails if the world's memory grows more than 15% after the first hour, if any minute's 99th-percentile step takes 50 ms or more once they're all in, or if anyone's sent out. Run it with nothing else on the machine: the players' copies of the world share its cores (they run at a lower priority, as if on devices of their own, and each minute's line says how busy the world's thread was and how many of buildings' insides' tiles it baked, besides its steps). `-- --minutes 10 --players 4` for a quick look. `--thin 25` adds 25 thin players, who hold no copy of the world (`ThinBot` in `client/js/core/bot.js`: they speak what a game speaks and steer by what they're told of their own hero), all in one process, so a world can be loaded with more players than the machine could play copies for; `--players` stay whole copies, which say whether a copy keeps to the host's (the world sent one again is counted and said, with how often for a copy found astray and how often for one fallen too far behind, as one slow to load is as it comes in). `--hold` has the thin ones hold a stick (16 commands a second each), `--fights` has them start field battles too, `--one-town` puts everyone in the humans' town (`--spread`, as without it: each by their own people's start town), and `--tunnel` brings everyone in through the tunnel listener, as the internet's. With more than 8 in the world, or more than a server takes, the soak opens its server with those limits raised, as `limits` among the options of `WorldServer.open`: there is no setting for them, so a server that's run as one can't be given them (`test/server-soak.test.js`, which also plays nine thin players in one world for a quarter of a minute). `-- --minutes 10 --players 4 --thin 25` is the plan's run (generated/multiplayer_scaling_plan.md 0-3). Its report is written to `test-results/server-soak/report.json`, with every step, tick and save of the run counted into the buckets the server's own metrics keep (`histograms`: what its `/metrics` would say, docs/SERVER.md, *Metrics*) |
| `npm run e2e:durations` | After adding browser tests, or making them much slower or quicker: times them by a CI run's reports (below) |
| `npm run build:manifest` | After changing anything under `client/`. It lists what the game downloads before it starts (`client/js/app/manifest.js`, every file with the hash of its bytes), the catalog of models downloaded only as they're wanted (`client/js/app/assets.js`, from `client/models/assets.json`), and the import map in `client/index.html` (every module at its address with its hash, and `main.js`'s own; after it a preload for each module `main.js` imports itself, and the page's style sheet asked for by its hash: generated/game_delivery_plan.md). `node scripts/build-manifest.js --root <folder>` makes them for a copy of `client/`, in that copy, as the Pages deploy does. The unit tests fail until you do. A browser that's run the game keeps every file by its hash and never asks for it again: after editing code, build the manifest before reloading, or the page asks for (and gets) the version it had |
| `npm run scramble` | Only when adding or remaking a licensed model (docs/LICENSED_MODELS.md): `-- <model.glb> <model.bin> --copyright "<whose it is>"` scrambles the model `utilities/blenderpipeline` made, as the game serves it, with whose it is stamped in it (its glTF asset's `copyright`), and checks it comes back. The scrambled copy goes in the private repository `hoffspot/conquest-models`. Its catalog entry in `client/models/assets.json` is marked `"licensed": true`, with its hash and size, and `test/scramble.test.js` checks every one so marked is scrambled, and no other. Then `npm run build:manifest` |
| `npm run models:fetch` | For the licensed models (the Dreadthorn's, the werewolf's, the centipede's, the Ant Monster's, the ant's, the two spiders', the scorpion's, the cockroach's, the wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', the infernal demon's, the stone golem's, the orcs', the kaiju's, the cerberus's, the Demon Boss's, the Order of the Bell's and its Prior's, the horses', Bellhaven's, the White Castle's, the timber forts' and the shop furniture's, Wind Ways', the taverns', halls', temples', smithies', shops' and dungeons' furniture's and the heroes' shields' and swords', Dragon Motion's, and the town houses' kit's, Meshsmith Foundry's), if the owner's given you access to the private repository `hoffspot/conquest-models` (docs/LICENSED_MODELS.md): clones it into `.models`, or brings it up to date, and puts its files in place under `client/`, each checked against the hash and size its catalog entry keeps. git ignores both. Without it the game draws the stand-ins, and the tests that need one say they're left out |
| `npm run build:characters` | Only when rebuilding the body from MakeHuman's MPFB2 (`-- --mpfb2=../mpfb2`). Then `npm run build:vitruvian`, which carries its shapes over |
| `npm run build:vitruvian` | Only when rebuilding the Vitruvian body (`client/characters/vitruvian.*` and its masks) from CharMorph's Vitruvian, or after rebuilding the MakeHuman body, whose shapes it carries over. It needs Vitruvian's files, and its `char.blend` is in Git LFS: `git clone --depth 1 https://github.com/Upliner/CharMorph-Vitruvian ../charmorph-vitruvian`, then fetch `char.blend` on its own as the top of `scripts/build-vitruvian.js` says, then `-- --from=../charmorph-vitruvian`. About 4 minutes. Then `npm run build:manifest` |
| `npm run build:music` | Only when remaking the music's instrument recordings (from the VCSL and VSCO 2 CE, each score's notes: `client/js/audio/scores.js`) |
| `npm run build:sounds` | Only when remaking the recorded sounds (`client/sounds` and `client/js/audio/recorded.js`: footsteps, and the recipes in `scripts/sounds`). It downloads their CC0 and public-domain recordings once, into `.cache` (about 700 MB: Freesound's previews, the VCSL's samples, the National Park Service's, OpenGameArt's, Kenney's and an itch.io pack whole), and takes a few minutes. `npm run build:sounds -- kaijuCall kaijuStep` makes only the sounds named again, from only their recordings, and keeps the rest as `recorded.js` has them (each must be there already): for adding or changing a few, or where Freesound can't be reached. Every sound, made now or kept, is checked against the rate the game decodes it at (`DECODED`, written into `recorded.js` as `RECORDED_RATES`): it stops at one with more above half that rate than goes unheard. Then `npm run build:manifest`, and describe any new sound in `client/js/audio/catalog.js` |
| `npm run build:props` | Only when remaking the dungeons' and the shops' furniture, dressing and wares (`client/models/dungeons`, its `LICENSE.md` and their entries in `client/models/assets.json`), or one of them (`npm run build:props -- skull bones`). It downloads each model once, into `.cache` (Poly Haven's, OpenGameArt's, and museums' and makers' scans and models on Zenodo and Objaverse: about 230 MB in all), makes each simpler and its pictures smaller and KTX2 (ETC1S, which the graphics card keeps compressed: `scripts/lib/ktx2.js`, with the `ktx2-encoder` package), and takes about ten minutes for all of them, most of it making the KTX2 pictures. The maces a hero's mace looks like come as Blender files and an FBX: Blender reads those (`scripts/lib/blender.js`, `scripts/blender/to-obj.py`, each made an OBJ once, kept in `.cache/blender`) with Blender's Python module, utilities/blenderpipeline's (`npm run setup` there) or another named by `BLENDER_PYTHON`; the rest need none. The keep's kit and any other `dungeon-prop-` entry not made here (not in `client/models/dungeons`) are left as they are. A new model must be CC0 or CC BY (its maker named in `PROPS`' `by`, which the `LICENSE.md` it writes lists, and credited in `README.md`), downloadable without an account, and within `test/furnishings.test.js`'s budget (650 KB a file, 22 MB in all, its pictures KTX2). Node's own `fetch` ignores `HTTPS_PROXY`: behind a proxy, run it with `NODE_USE_ENV_PROXY=1` (Node 22.21 or later). Then `npm run build:manifest` |
| `npm run build:textures` | Only when remaking the dungeons' photographs (`client/textures/dungeons`, `client/js/world/dungeonpictures.js` and their entries in `client/models/assets.json`). It downloads their CC0 scans once, into `.cache` (about 45 MB from ambientCG and Poly Haven), makes each a KTX2 (`scripts/lib/ktx2.js`: the colour ETC1S, the normal map UASTC), and takes about a minute. Then `npm run build:manifest` |
| `npm run build:clips` | Only when remaking the character lab's animation clips, or the clips baked into the game's attacks, rests, guards' sway, flinches and dodges (`client/js/characters/clip-keys.js`, from `scripts/bake-clips.js`'s list, baked on MakeHuman's body whichever the game plays on: `BAKE_BODY`; a rest's timing in `client/js/core/roles.js` is its clip's, which the tests check). It needs Mesh2Motion's files: `git clone --depth 1 https://github.com/Mesh2Motion/mesh2motion-app ../mesh2motion-app`, then `-- --from=../mesh2motion-app/static/animations` |
| `npm run build:mac` | Changes to the Mac app (`mac/`) or what its bundle holds: on a Mac, after `swift build -c release --arch arm64 --package-path mac`, `-- --executable <its PellagosServer>` makes `dist/Pellagos Server.app` (Node arm64 from nodejs.org, checked against its `SHASUMS256.txt` and the hash kept in `NODE`, its own signature kept; the server and the game), signs it ad hoc and zips it; with the server's archive and Homebrew formula beside it. Elsewhere `-- --no-executable` makes the rest of the bundle, unsigned. Node's archive is kept in `.cache/node`. To move to a newer Node, change `NODE` (its version and its archive's SHA-256 from that release's `SHASUMS256.txt`), having run the unit tests on that Node first (not Node 26 yet: section 2, *Which Node*). `test/mac-app.test.js` checks the bundle without a Mac; the macOS workflow builds it on one (above) |
| `npm run release-key` | For the project's owner, if they want releases signed as well as checked against GitHub's SHA-256 (docs/SERVER.md, "Releasing"): `-- --new <file outside the repository>` makes the release key pair once (the public half into `server/update/release-key.pem`, to commit; the private half kept by the owner alone, never committed), `-- --sign <archive> --key <file>` signs a release's archive (or with `PELLAGOS_RELEASE_KEY`, as the Mac app workflow does), `-- --verify <archive>` checks it |
| `npm run build:pointers` | Only when redrawing the mouse pointers (`client/images/pointer/`: the sword, its looks over things and shaken, each size at 1x and 2x, drawn in `scripts/build-pointers.js` from what `client/js/app/pointer.js` asks for). It rasterizes them with Playwright's Chromium (or `CHROMIUM_PATH`'s), in a second or two. `test/pointer.test.js` fails while one is missing or the wrong size. Then `npm run build:manifest` |
| `npm run build:backdrops` | Only when adding or changing the paintings behind the loading screen and the title (`client/images/backdrops/`, the scenes in `client/js/app/backdrop.js` `BACKDROPS`). Put each scene's master in `scripts/backdrops/` as `<scene>-tall` and `<scene>-wide` (as it's painted: a scene may be only one), a JPEG or a PNG, the owner's own (they're the repository's, under its licence) or CC0, and add it to `BACKDROPS`. It makes each an AVIF and a WebP at its master's size, or no more than 2560 pixels its longest side (`BACKDROP.most`: a 2K master, 2752 by 1536, is made 2560 by 1428), with ffmpeg (which needs libaom-av1 and libwebp), in a few seconds. `test/backdrop.test.js` fails while one is missing, the wrong way round, or over its budget (100 KB an AVIF, 150 KB a WebP). Then `npm run build:manifest` |
| `npm run build:crest` | Only when changing the crest over the loading screen and the title (`client/images/crest/`, `client/js/app/crest.js`). Put its master in `scripts/crest/` as `crest.jpg` or `crest.png`, painted on flat magenta (as near #FF00FF as it comes: the magenta's measured at its corners, and it stops if they aren't magenta), the owner's own (it's the repository's, under its licence) or CC0, 1376 by 768 pixels as `CREST.size` has it (or change that, and where its ribbon and eyes are: `CREST.ribbon`, `CREST.eyes`, and `.crest-name`, `.crest-eye` and `.crest-lid` in `client/styles.css`). It cuts the crest out of the magenta and makes an AVIF and a WebP, both see-through, with ffmpeg (which needs libaom-av1 and libwebp), in a few seconds. `test/crest.test.js` fails while either is missing, not see-through, not its master's size, or over its budget (120 KB the AVIF, 200 KB the WebP), or while the page's and the styles' places aren't `CREST`'s. Then `npm run build:manifest` |
| `npm run build:footprints` | After changing how a prop or a yard's fence looks (`client/js/world/art/kits/props.js`, `peoples/props.js`, `kits/yards.js`): measures what each stands on into `client/js/core/setpieces/outlines.js`, which the navigation mesh walks round. `test/footprints.test.js` fails until you do. Then `npm run build:manifest` |
| `npm run vendor:three` | Only after changing the `three` version in `package.json`, or which of its add-ons the game uses (`ADDONS` in `scripts/vendor-three.js`, with the Basis Universal transcoder for KTX2 textures; the licences their packages don't carry are kept in `scripts/licences/`). Then `npm run build:manifest`. Where the game leans on how three.js itself is written, a unit test fails if a new version writes it otherwise, and says what to follow: `test/light.test.js` (how it sets a light's shadow map up, which the view makes first: `client/js/world/shadows.js` `shadowMapOf`), `test/gpumemory.test.js` (the compressed formats it asks WebGL for), and `test/buildings.test.js`, `test/far.test.js` and `test/characters.test.js` (its name for the baked light from all round, by which the atlas and still water reflect the sky, `ENVMAP_TYPE_CUBE_UV` in r186 and `ENVMAP_TYPE_PMREM` in r187, both asked for; and the lines of its lighting that skin's and hair's replace, r186's and r187's) |
| `npm run vendor:meshopt` | Only after changing the `meshoptimizer` version |
| `npm run vendor:ed25519` | Only after changing the `@noble/ed25519` or `@noble/hashes` version: bundles what the game checks a world server's identity with (`client/js/core/identity.js`) and makes and proves the player's own with (`client/js/core/player.js`). Then update their import paths and `npm run build:manifest` |
| `npm run vendor:qrcode` | Only after changing the `qrcode-generator` version: copies the QR code maker the world server's management page draws its invites with (`client/admin.html`). Then update its path in `client/js/admin/page.js` and `npm run build:manifest` |
| `npm run vendor:recast` | Only after changing the recast-navigation version: `@recast-navigation/core` and `@recast-navigation/wasm` in `package.json`, both the same and each an exact version, not a range (every device bakes its own navigation tiles, so every device and every checkout must have the same Recast). It writes `client/vendor/recast-navigation-<version>/` (with `recast.mjs`, the one module the game imports from it), points `client/js/core/navigation/recast.js` at it (the only place the game spells the folder), and removes any other version's folder. It also makes Recast's WebAssembly start with 16 MB of memory, not the 64 MB it's built with (`STARTING_MEMORY`, by `scripts/wasm-memory.js`); `test/release.test.js` checks it. Then `npm run build:manifest`, and the folder's name where `README.md`, `docs/WORLD.md`, `test/manifest.test.js` and `test/release.test.js` have it. `test/bake.test.js` fails while `package.json`, the lockfile, the folder, `recast.js` and those four don't all name the one version, and it holds three tiles' bytes and the ways over them as recorded: a new version (or a change to the bake's settings) that changes one fails it. If it does, the change needs `NET_VERSION` bumped (section 3) and the test's record made again; 0.44.0 baked every tile tried byte for byte as 0.43.1 did |

### The browser tests

They play the game in Chromium, in software without a GPU, so they're slow (each has 3 minutes, and a median one takes 55 seconds on CI).
Run the ones your change touches, one at a time:

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium E2E_PORT=8096 \
  npx playwright test e2e/pellagos.spec.js -g "<part of the test's name>" --workers=1 --reporter=line
```

- `E2E_PORT` picks the port for the test server, so it doesn't clash with a game you're running
  (the default is 8095).
- `rm -rf test-results` first, if an earlier run left its pictures and traces there.
- Every spec opens the game with `playing` (`e2e/fixtures.js`), and the game's drawn cheaply
  unless the test says otherwise: at Low without shadows (kept as the game's settings before the
  page loads, where the test keeps none of its own), looking down on the player once it's
  playing. In software that's five times as many frames a second as High from where the camera
  starts, out across the land (measured: 2.1 a second against 0.4). A test of what's drawn at a
  higher quality, of shadows, grass, water or the far land, of how many bodies are held at High,
  or of the camera and where things are on the screen, asks for exactly what it needs and says
  why in a comment: `playing`'s `quality`, `shadows` and `view: "start"`, `FULL` for all three, or
  `test.use({ drawing: "full" })` for a whole spec. Never change what a test asserts to make it
  pass at Low: a test that fails there for any other reason than being about High has found
  something.
- A test that waits on the game's time stops the game and plays it on by hand (`playUntil` in
  `e2e/fixtures.js`). Do the same in new tests, and never wait on the clock. The one test that
  must let the clock run is the measured run's (`e2e/measure.spec.js`: a run is as long as its
  frames' own times add up to, so the game can't be played on by hand through it); it asks for
  twenty seconds and waits on the run saying it's done.
- A test whose games must run on (two players, say) but that looks at nothing drawn (menus, chat,
  what's said, who's let into which world) stops their drawing once they're playing (`undrawn`
  in `e2e/fixtures.js`, or `playing`'s `drawn: false`). Without a GPU, drawing is most of every
  frame, and every click waits on a frame or two: undrawn, the direct message test went from
  about 290 seconds to 100.
- An `expect` waits 20 seconds before it fails, not Playwright's 5 (`playwright.config.js`): on a
  slow runner 5 was too few, and two tests failed for it now and then. A test that fails leaves
  what it saw in its output folder (`e2e/fixtures.js`): a picture of each page, the game's
  messages and where everyone was (`game-N.json`), and its debug log; CI keeps the folder with
  the run (`e2e-failures-<share>`).
- `/?play`'s hero is made from the world's seed (`client/js/app/heroes.js` `quickStartHero`), the
  same every time for a seed and people: `&hero=1`, `2`... for another body of the same seed.
- They never reach the game's default world server (`pellagos.duckdns.org`, which every game
  knows from the first: `client/js/app/servers.js` `DEFAULT_SERVERS`). `playwright.config.js`
  launches Chromium with `--host-resolver-rules` making its name resolve to nothing, so the game
  finds it unreachable at once; a test that launches its own (`test.use({ launchOptions })`, as
  `e2e/broker.spec.js` does) gives the same rule. A test that needs a world server runs its own.
- A test can't pair a game controller: `e2e/controller.spec.js` gives the page a stand-in
  (`standIn`: `navigator.getGamepads` replaced before the page loads, its buttons and sticks set
  by the test). The game reads it once a frame, so a press is held for one frame, not for a set
  time; whatever else reads it in that frame or between frames (a page of Game options asking
  whether it can rumble) is given the same, as a real controller's would be. Do the same in a new
  test of the controller.
- Each test has three minutes (`playwright.config.js` `timeout`). One that needs more sets its
  own (`test.setTimeout`), at least twice as long as it takes on CI (`e2e/durations.json`): CI's
  machines can be 1.7 times as slow from one run to the next, and the start view looks out across
  the land, which is slow to draw in software. One that times out on CI only for being slow is
  given longer, said why in the pull request; one that hangs (waiting on what never comes) is
  fixed.
- Time the tests by how long they took on CI, so its split stays even. CI runs for pull requests
  alone, so the run is your pull request's: `gh run list --workflow ci.yml --branch <your branch>`
  gives its number, as does its page's address. Once it's done, download its reports, one from
  each job (`gh run download <run> -p 'e2e-report-*' -D reports`, or the run's page, Artifacts),
  then `npm run e2e:durations -- reports/*/e2e-report.json` on the branch the run was of. Commit
  `e2e/durations.json`, not the reports. Do it after adding browser tests, making them much
  slower or quicker, or whenever CI's `e2e` jobs end far apart.
- The run needn't be green. A test is timed only where it passed: one that failed or ran out of
  time keeps the time it had (out of time, it took its time limit, which says nothing of how long
  it takes), and the script names them. A time kept for a test that's since been taken out or
  renamed is dropped: the script lists the tests there are now (`playwright test --list`).
- To time some locally instead (for a new test before it's been on CI; a machine of your own
  can be quicker or slower than CI's, so a CI run's times are better): `PLAYWRIGHT_JSON_OUTPUT_NAME=report.json npx playwright test --workers=1
  --reporter=json`, then `npm run e2e:durations -- report.json`.

### The motion check

`scripts/motion-check.js` plays every motion the characters make on each people's bodies at the
ends of their builds (thinnest, shortest, bulkiest, tallest), holding what they hold. It measures:

- joints turned past their ranges;
- things held or worn sunk into the body, and forearms or hands sunk into the torso;
- planted feet sliding, and feet in the ground;
- a two-handed weapon's second hand off its haft.

What's wrong already is kept in `test/motion-baseline.json`. The check fails only on what's new or
worse than that, so CI catches a change that makes any motion worse on any body.

```sh
npm run check:motion                      # everything (about 13 minutes on four threads; it uses all yours)
npm run check:motion -- --only attack/    # only the motions whose ids start so
npm run check:motion -- --body orc-       # only those bodies
npm run check:motion -- --update          # keep this run's failures as the new baseline
npm run check:motion -- --data vitruvian  # on another body's data (the baseline is the game's body's)
```

- **To see what it found**, run `npm start` and open `/motion-sheet.html`. It draws each failure
  as it happened, the spot ringed in red, worst first; what's worse than the baseline is outlined
  in amber (*Only what's new*). Tick *Close up* to look closely. It reads the report the check
  leaves beside it (`client/motion-report.json`, not committed); a CI run's `motion-report`
  artifact can be chosen with *Report*.
- **To watch a motion through**, open `/motion-sheet.html?film=attack/gauntlets/5,attack/sword/0&body=human-tallest-m&frames=8`:
  each motion a row of frames from its start to its end on that body (ids as the report has
  them). Add `&view=front` or `&view=side` to see it from there, and `&data=vitruvian` (or
  `human`) for another body's data. Use it for before-and-after pictures of a motion you've
  changed.
- **When it fails** (`WORSE:` lines): fix the motion. If the change is right and the motion was
  meant to change, run it with `--update`, which says again what got worse, and say why in the
  pull request.
- **When something got better** (`better:` lines), run it with `--update` and commit the smaller
  baseline, so the improvement is kept.

### Measuring a real device

No check here says how the game keeps up on a phone: CI draws in software, and a rack of charging
phones says nothing of heat. That's measured by hand, with a link. `measure=<name>&minutes=12` in
the link a game's opened with counts every frame of that game for twelve minutes and leaves a
report (docs/GAME.md, *Measuring a device*): on the device, and, in a world on a world server,
on that server, where the management page's **Measured runs** shows it (docs/SERVER.md,
*Measured runs*, with the steps for a phone under *Measuring a phone*). Nothing of it runs
without the parameter. A change to what a frame costs on a phone is measured so, before and
after, on the same device and world, and the two reports go in the pull request. Its tests:
`test/measure.test.js`, `test/measuring.test.js`, the measured runs in `test/admin.test.js` and
`test/world-store.test.js`, `e2e/measure.spec.js` and `e2e/admin.spec.js`.

### The tools in `utilities/`

`utilities/blenderpipeline/` turns `.blend` files, and FBX and glTF files as models for other
engines come (Unity's, Unreal's, Maya's), into GLB models for the game, with their animations
(its `README.md`). A config can build a model several ways (`profiles`): `full`, as it is, to
keep; and one for play, made for a phone and a browser (`phone`), which is what the game ships.
It's a project of its own, with its own `package.json`, lockfile and tests. The game's `npm ci` doesn't install it, and CI doesn't run its tests, because it needs
Blender (a large download). CI's `npm run lint` does lint its JavaScript (`eslint.config.js`).
When you change anything in it, run its checks there:

```sh
cd utilities/blenderpipeline
npm ci
npm run setup          # once: Blender as a Python module, in .venv (Python 3.11; about 1 GB)
npm run build          # rebuild the examples into dist/ (each profile into dist/<profile>/), and commit dist/
npm test               # unit tests, and every example built with Blender: fit, and as dist/ has it
CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:browser   # every GLB played in Three.js
```

- `npm run setup` needs Python 3.11 and the Python package index (PyPI), which the cloud
  environments' default network access lets through. Or set `BLENDER` to a Blender 4.2 or later.
- `npm test` fails if `dist/` isn't what the sources build: after changing the pipeline or an
  example, `npm run build` and commit `dist/`.
- Bought assets never go in the repository, built or not: `utilities/blenderpipeline/private/`
  is ignored by git for them (section 3, *Assets*). What the game draws of one goes, scrambled,
  in the private repository (`docs/LICENSED_MODELS.md`).
- Its test fixtures are made by scripts (`node build.js --fixtures`), never bought: a test of FBX
  input uses `fixtures/fbx-creature/`, made by `fixtures/make_fbx_creature.py`.
- An asset sold for Unreal Engine is exported out of it by `unreal/export_assets.py`, run in the
  Unreal Editor (its `README.md`, *From Unreal*): its meshes and animations as FBX, its textures,
  and `notes.json` (which texture each material takes). It reads each mesh's FBX back and says what
  Unreal's FBX export left out (a section simulated as cloth, or turned off), exporting that mesh
  as glTF too, and whether that glTF's skin weights came through whole (`glbSkins`: a cloth
  section's are left at nothing). Unreal can't run here, so its tests run on a stand-in for Unreal's Python module,
  which writes FBX and glTF files as Unreal does (`python3 unreal/test_export_assets.py`; `npm test`
  runs them too).
- Scenery the game walks on, such as a castle, is cut into cells (`cells`): the game draws only the
  cells in view, each at its own detail. Where it can be walked is baked from it (`walk`) into
  `<name>.walk.json`, and the same as a module, `<name>.walk.js`: the height of each square a body
  can stand on, in levels where one floor is over another, and the links between them (the README,
  *Where it can be walked*). With `"under"`, it also has the lowest of the scene and the top of its
  ground over each patch of a coarser grid; with `"ground"`, the top of its own terrain and of all
  that stands on it. The game lays the world's land along and under those where it sets the scene
  into the world (`core/terrain/scenes.js`). It's plain data with no mesh or texture. For a bought
  scene it's the one thing built from it that goes in this repository: its module in
  `client/js/core/scenery/`, where the game's code imports it (Bellhaven's: `core/scenery.js`). Its
  scrambled model goes in the private one. `lib/walk.js` has unit tests of its own
  (`test/walk.test.js`), which need no Blender.
- A scene's rocks that touch nothing are set down on what's under them, or left out (`seat`, the
  README's *Rocks that touch nothing*), after it's simplified: no rock hangs in the air in the
  game. `lib/seat.js` has unit tests of its own (`test/seat.test.js`), which need no Blender. The
  skill `.claude/skills/set-scene-into-world` says how a scene's set into the world and checked;
  `.claude/skills/import-scene-model`, how a bought scene comes in from the pack to a place of its
  own (its build, its walk, its map, its insides a dungeon drawn with its own pieces), with what the
  White Castle taught and the scripts that measure and picture it. A kit of a pack's pieces is cut
  apart once baked (`cells.bakeFirst`, the README's *A kit of pieces*), every piece on one atlas:
  `.claude/skills/import-prop-kit`.

## 3. Making a change

1. **Start from the latest `main`**, on a branch named for the change
   (`git fetch origin main && git checkout -b <you>/<what-it-does> origin/main`). One topic per
   pull request: small pull requests are reviewed quickly and are easy to undo.
2. **Read the docs for what you're changing first.** The game's design lives in `docs/`
   (`GAME.md`, `WORLD.md`, `WAR.md`, `WILDS.md`, `DUNGEONS.md`, `MAGIC.md`, `CHARACTERS.md`), the tooling in
   `README.md`, and plans in progress in `generated/` (e.g.
   `generated/terrain_navmesh_overhaul_plan.md`).
3. **Write the code the way the code around it is written:**
   - Four-space indents, double quotes, semicolons. There's no formatter: don't run Prettier or
     any other formatter over the code. ESLint (`eslint.config.js`) is the only style check.
   - `client/js/core/` is the game's rules, its world generation and multiplayer. It must not
     touch the DOM (it also runs under Node). It must come out the same in every browser: use
     `client/js/core/exact.js` (`sin`, `cos`, `atan2`, `hypot`, `sqrt`, `pow`, `log`, `exp`)
     instead of `Math.sin` and the like, and the seeded random numbers
     (`client/js/core/random.js`) it's given, never `Math.random`. Two players' browsers must
     build the same world and play out the same fight.
   - The game has to run well on a phone (the budget is an iPhone 16 Pro). Anything costly to
     draw goes under the Visual quality setting's levels.
   - A mesh or picture made once and never read on the page again (not merged, cloned, posed or
     bent, nor composited or sampled by code) can let go of the page's copy once it's on the
     graphics card: `releaseGeometry` and `releaseTexture` (`client/js/world/release.js`), as
     the undergrowth, hedges, ground and building atlas do, and `releaseCompressed` for a
     compressed (KTX2) picture, as every bought model's, scene's and kit's is when its file's read
     (`client/js/world/art/engine/models.js`). So a model's picture mustn't be let go of off the
     graphics card and drawn again, have its wrapping, filtering or colour space changed once
     it's been drawn, or be drawn by a second renderer. On a phone the graphics card shares
     the page's memory, so the copy costs twice. Don't for anything read again, unless it can
     be made again when it's wanted: a garment's own picture, which outfits are put together
     from, is kept till it's been unused half a minute and painted again after
     (`client/js/characters/wardrobe.js`). Whatever's merged into the art's one material
     (`joined` and `merge`, `client/js/world/town3d.js`: buildings, bridges, insides) is let go
     of so already, its box and sphere worked out first: once it's been drawn, read those, not
     its corners, or ask for it `kept`. Nor an attribute or index several meshes share (the
     ground's triangles): three.js takes it off the graphics card with any of them thrown away,
     and sends it again from the page's copy. (A game character's skin is let go of once it's
     sent, as it's painted again whole whenever it changes, and so are its outfit's pictures,
     but the small copy a crowd's figure is made from. A drawing lost and given back then loads
     the page again, where the player was: `docs/GAME.md`.)
   - A new shield (an item in `ITEMS`, `client/js/characters/equipment.js`, held on the left
     forearm or fist) must say whether it's slung on the back once the weapons are put away:
     `sling: true` for a round, kite or other strapped shield light and short enough, `false`
     for one that isn't (a tower shield, one with spikes round its rim, one carried by a stick).
     The reasons for each are kept beside `SLING` and in `docs/CHARACTERS.md`. A test fails if
     a shield doesn't say.
   - A new blade hung at the hip (`SHEATHS`, `hangs: true`) goes on a frog (`leftFrog`), with
     `round` (degrees round the front of the hip) if 35° doesn't suit it. It's fitted to each
     body and canted 45°, and the left hand rests on its pommel walking. A test checks the cant
     and the fit on every motion-check body. A rest whose left hand passes that hip must bring it
     over the hilt and scabbard, not through them (the sentry's `ARMED_*` rests). Or it can rest
     the hand on the pommel with `pommel: 1` in its keys.
   - A sound added or changed (`SOUNDS` in `client/js/audio/synth.js`, or a recording in
     `client/js/audio/recorded.js` by `npm run build:sounds`) is described in
     `client/js/audio/catalog.js`: its group, its name, what it is and when the game plays it.
     The sound studio (`client/sound-studio.html`) shows and plays it from there, so keep its
     words true when the sound or where it plays changes. A recording names its source in
     `SOURCES` (title, recordist, page, licence). `test/audio.test.js` fails if a sound isn't
     described or a recording has no CC0 source. A recording's decoded when it's first wanted
     and may be let go of again once it's done (`DECODED_BUDGET` in `client/js/audio/sound.js`),
     so play it through `sound.js` and don't keep its decoded copy anywhere else.
4. **Bump a version number when you change what it guards:**
   - `NET_VERSION` (`client/js/core/netplay.js`): anything players' games say to each other, or
     anything that changes the world or the rules two games must agree on. A game of another
     version can't join.
     - **What needs no bump: an addition that's opted into.** A new kind of message, or a new
       field in one there is, leaves `NET_VERSION` alone when all of these hold: it's sent only
       to a game that has said it speaks it (`speaks`, in a joiner's `hello` and a server's
       `/enter`: `SPEAKS` in `client/js/core/netplay.js`), or it's a field a game that doesn't
       know it reads past; a game that never hears it plays exactly as before; it changes
       nothing of the world or the rules two games must agree on (lockstep's ops, the steps,
       the checksum); and a refusal's words only ever gain what can be left out, since games of
       every version read them. Anything else bumps it, as ever. A unit test holds each such
       addition to both ends: one that says it speaks it, and one that doesn't.
     - **No name is ever used again.** A message's `kind`, a field of one, a refusal's reason, a
       name in `speaks`, a world's or the server's setting: once it has shipped, its name means
       that for good, even after what it named is taken out. A game or a server left on an
       older version would take the new meaning for the old.
   - `VIEW_VERSION` (`client/js/core/view.js`, once the replicated views are built:
     generated/multiplayer_scaling_plan.md 3-13): what a view's frame holds, its first byte. It
     moves only when the frame's bytes do, and never with `NET_VERSION`: a change to lockstep's
     messages or to what both netcodes share bumps `NET_VERSION` alone, a change to the frame
     bumps `VIEW_VERSION` alone, and a game says which views it reads in `speaks`. Until
     `view.js` exists there is nothing to bump.
   - `SNAPSHOT_VERSION` (`client/js/core/host.js`): what a snapshot of the world holds. A world
     kept by an older version is carried on, not lost (the world server keeps worlds): add a step
     from the version before to `SNAPSHOT_STEPS`, filling in what the new version keeps as it
     would have been, and once your change is in, `npm run snapshot-fixture` for the new
     version's fixture (`test/fixtures/snapshots/`; keep the older ones). `test/snapshots.test.js`
     brings every fixture forward through the steps and plays on from it.
   - `WAR_VERSION` (`client/js/core/war/war.js`): what the war's snapshot holds. A war kept by an
     older version is carried on, not set aside: `War.restore` fills in what it hadn't kept, a
     step for each version, so add yours there.
   - `SAVE_VERSION` (`client/js/app/save.js`): the save format. A save from another version is
     set aside, not misread; or, where it can be, moved to the new one, as version 1's one
     character is (save.js `migrate`). Players keep their characters. Add a step to `SAVE_STEPS`
     too, taking a character's export (`exportCharacter`'s) from the version before to yours: a
     character file (`app/character-file.js`) made by any version of the game is brought in
     through them, and `test/character-file.test.js` checks there's one for every version.
   - The world server's data, which must never be lost on an upgrade
     (`generated/world_server_plan.md` §5.1). Each version has a step forward beside it, a
     function taking what an older server kept to the next version; a newer server's is refused.
     `test/storage.test.js` checks the steps.
     - `LAYOUT_VERSION` (`server/storage/folder.js`): where things are in the server's data
       folder. Add a step to `LAYOUT_STEPS` that moves them.
     - `CONFIG_VERSION` (`server/storage/settings.js`): what a setting in `server.json` is called
       or means. Add a step to `SETTINGS_STEPS`. A new setting needs no bump: give it a schema in
       `SETTINGS`, and its default fills it in.
     - `FORMAT_VERSION` (`server/storage/worlds.js`): what a world's `world.json` holds. Add a step
       to `FORMAT_STEPS`.
     - What an older server's launcher (`server/launch.js`) expects of a newer version it runs
       after an update: `server/serve.js`, taking the same arguments; `process.send({ pellagos:
       "running", version, worlds })` once it's serving; exit code 75 to be started again; and
       `PELLAGOS_TRYING=1` while it's being tried. Keep all four, or older servers can't update to
       yours.
     - `SECRETS_VERSION` (`server/access/secrets.js`) and `ACCESS_VERSION`
       (`server/access/world.js`): what the server's `secrets.json` and a world's `access.json`
       hold (keys, codes, players, bans). Add a step to `SECRETS_STEPS` or `ACCESS_STEPS`.
       Never keep a key, code, ticket or session as it is: only its hash (`server/access/tokens.js`).
     - A server's archive (`ARCHIVE_FORMAT`, `server/storage/archive.js`) is the data folder's
       files as they were, so restoring an older one is brought forward by the steps above, as
       the data folder is. Change the archive's own format only with a reader for the one before.
   - **Never take a step away.** Every step above (`SNAPSHOT_STEPS`, `War.restore`'s, the save's,
     the server's) stays, and so does every snapshot fixture: a world, a hero or a server kept,
     exported or archived by any version since is always brought forward. `test/snapshots.test.js`
     fails if the oldest snapshot version that's brought forward rises. What's older still is
     salvaged, not refused: a world's land started afresh from its seed, its war and heroes kept
     (`server/reopen.js` `freshStart`).
   - The caches' versions (the `-v2` in `client/sw.js`): never for a release. Data is kept by the
     hash of its bytes, so a changed model, body or image needs nothing. Change the shell's
     (`SHELL`) only to let go of code no release uses any more, such as an old Three.js's
     folder; the others only when how they're laid out changes. Changing one lets go of all it
     holds, and nothing else. The crowds' figures kept between sessions
     (`client/js/world/figurestore.js`, the cache `pellagos-figures-v1`) are kept under the
     code's version, so a release needs nothing: change `FIGURES_KEPT.format` there only when
     how a figure's laid out as bytes changes without the code's version changing (it can't, on
     the deployed site), and its cache's name there and in `client/sw.js` together.
   - **Two netcodes side by side** (generated/multiplayer_scaling_plan.md, *How multiplayer
     stays playable at every merge*). While lockstep and the replicated views both ship, every
     change keeps to these:
     - Everything new is behind a switch whose default is today's behaviour (a world's
       `netcode`, the server's `replication`), and a world of 8 or fewer can always be opened
       as lockstep again.
     - Every switch has an expiry: a date in a test that fails once it's passed, so the switch
       is taken out or its date argued for, never forgotten (`unexpired` in `test/helpers.js`;
       `test/netcode.test.js` holds the dates, and fails for a setting that's one of a few,
       a schema's `choice`, with no date there).
     - A change to what's replicated changes lockstep's op and the view's schema in the same
       pull request, with a test of each.
     - **No pull request for replication bumps `SNAPSHOT_VERSION`.** The save is the same
       `Host` snapshot whichever way its players are connected, so a release can always be
       rolled back without stranding a world (an older server refuses a newer save).
     - A change to the transport (the play socket, the relay, the links) is tested in both
       netcodes.
     - The client says what it speaks before a world asks it of anyone: a refusal's words ship
       at least one release before the first world that can give them.
5. **Test it.** Add or update unit tests (`test/*.test.js`, `node:test`) for every change to the
   rules, the world or the tools, and a browser test (`e2e/`) for anything a player does on
   screen. A test of how games keep together over a link uses the bad-link kit
   (`test/badlink.js`): `BadLink`, a seeded link for Node (a round trip, jitter, hold-ups of 200
   to 1,000 ms, which is how loss shows on an ordered stream; or unordered, losing and
   reordering), the same every run, with a few links by name (`LINKS`); and `badProxy`, a TCP
   proxy to put between a page and a browser test's server. Never a link of the test's own
   making, and never the clock's time in a Node test of one. Never skip, disable or loosen a test to get CI green: fix the cause. A test that
   checks how long something takes times it with `quickEnough` (`test/helpers.js`): the other
   test files run beside it, and a busy or slow CI machine can take the cores for a while, so
   it's timed again once if it's over and fails only if it's over both times. Each timing does
   the work from the start, nothing kept from the one before (a fresh mesh, world or battle).
6. **Show it.** For anything that changes how the game looks, take before and after pictures
   from the same place, and put them in the pull request. Picture sheets and scratch scripts
   aren't committed.
7. **Document it.** Update the `docs/` page for the game's behaviour, `README.md` for tooling,
   and this file for the pipeline (the standing rule).
8. **Assets:** only your own work, or CC0, MIT and similarly permissive assets, each with its
   licence file and a credit in `README.md`'s *Credits and license*. Nothing with a licence that
   restricts use. That goes for the tools' test assets in `utilities/` too. A bought model, and
   anything built from it, stays out of the repository: keep it in `utilities/blenderpipeline/private/`,
   which git ignores. The exceptions are the licensed models, the Dreadthorn's, the werewolf's, the
   centipede's, the Ant Monster's, the ant's, the two spiders', the scorpion's, the cockroach's, the
   wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', the infernal demon's, the stone golem's, the orcs', the kaiju's, the cerberus's, the Demon Boss's, the Order of the Bell's and its Prior's, the horses', Bellhaven's, the White Castle's, the timber forts' and the shop furniture's, Wind Ways', the taverns', halls', temples', smithies', shops' and dungeons' furniture's and the heroes' shields' and swords', Dragon Motion's, and the town houses' kit's, Meshsmith Foundry's: bought, and in the game with permission (the Dreadthorn's the repository's owner obtained, the others' their
   Fab Standard License gives), only in their converted form, and scrambled
   (`npm run scramble`). They aren't in this repository either, but in the private
   `hoffspot/conquest-models`, which the builds fetch (`npm run models:fetch` for your own copy,
   with access to it; `docs/LICENSED_MODELS.md`). Their licence note is
   `client/models/beasts/LICENSE.md`. Another exception is the owner's call, never a
   contributor's. Bringing in a model the owner bought, from the Drive link they share to the
   creature in the game, is written down step by step in
   `.claude/skills/import-licensed-model/SKILL.md`, with the scripts that picture and measure its
   clips; a scene or a building the owner bought, in `.claude/skills/import-scene-model/SKILL.md`;
   a pack's loose furniture and things made into a prop kit, in
   `.claude/skills/import-prop-kit/SKILL.md`.
   Third-party code goes in `client/vendor/` through a `scripts/vendor-*.js` script.
9. **Heavy models go in the catalog, not in what's downloaded before the game starts.** That has
   a budget, `BOOT_BUDGET` in `test/manifest.test.js` (16 MB), and raising it is a choice to make
   in review. A model the game can start without goes in `client/models/assets.json`: each with
   its `tier` (`near`, fetched when it's predicted to be wanted soon, or `demand`, only once it's
   needed) and its `files` (`path`s under `client/`, its lower-detail copy first), and whatever
   else `generated/asset_streaming_plan.md` (section 2) says it needs. Then `npm run build:manifest`.
   A creature drawn from a model (the Dreadthorn, the werewolf) also has an entry in `MODELS`
   (`client/js/beasts/model.js`): its catalog entry, the skins its kind wears (its catalog
   entry's `<id>-skins`), its size, and which of its clips and bones are what. Its look in
   `client/js/beasts/looks.js` stands in for it until it's read. `test/model.test.js` checks every
   clip, bone and skin it names is in the model and the catalog, and that it's a lair's master or
   met in the wilds.

## 4. Before you push

Run these and fix everything they find:

```sh
npm run build:manifest   # if anything under client/ changed
npm run check            # lint + unit tests, as CI's test job runs them
npm run check:motion     # if characters' motions, bodies or what they hold changed
npx playwright test ...  # the browser tests your change touches (above)
# if anything under utilities/blenderpipeline/ changed, its own checks there (section 2)
git status               # only the files you meant to change
```

- **Docs only** (nothing changed but Markdown files: `docs/`, the plans in `generated/`,
  `README.md`, this file): run none of the checks that run code. CI still runs them all, and
  `test/contribution.test.js` reads this file, so a script it no longer names fails there.

- Add files by name (`git add path/to/file`), not `git add -A` or `git add .`. Never commit
  `node_modules/`, `test-results/`, `playwright-report/`, reports, pictures you took to check
  your work, or scratch files.
- Read your own diff as a reviewer would.
- Write a commit message that says what changed and why. If Claude wrote the commit, it adds
  its own `Co-Authored-By` line. Keep it.

## 5. Opening the pull request

1. Push your branch (`git push -u origin <branch>`) to your fork, or to the repository if you
   have write access.
2. Open a pull request against `hoffspot/conquest`'s `main`. Say:
   - what it changes and why;
   - how you tested it (which unit and browser tests; what you checked by playing);
   - before and after pictures for anything that looks different;
   - any version you bumped.
3. CI runs: the `test` job, the `motion` job and the 12 `e2e` jobs, about 25 minutes (section 2,
   *How long it takes*), then `ci`, which says in a few seconds whether they all passed. A
   first-time contributor's CI may wait for a maintainer to approve the run.
4. If CI fails, read the failing job's log (for a browser test, look too at what it left: the
   run's `e2e-failures-<share>` artifact, section 2), reproduce it locally, fix it and push again. A
   failure is never "just flaky" until a re-run of the same commit passes and you know why it
   failed. Don't push empty commits, or close and reopen the pull request, to set CI going again.
5. If `main` moves on, bring your branch up to date (section 6).
6. Answer every review comment: change the code, or say why not.
7. A maintainer merges it, with a merge commit, once CI is green on a head that's up to date with
   `main` and it's been reviewed. Don't merge your own pull request unless the owner has said you
   may. Once it's merged, GitHub Pages publishes the game from `main` a minute or two later.
   Nothing is tested again on `main` (section 2): the pull request's green run was of those very
   files.

## 6. Merging cleanly when others are working too

Several people, and their Claude sessions, work on this repository at once. A pull request's CI
tests it merged into `main` as `main` was when CI ran. If someone else merges first, your green
tick may no longer be true: the two changes can conflict, or each pass alone and fail together
(both bump `NET_VERSION` to the same number; both add to the same table).

**Before you merge (or ask for a merge):**

1. Bring the branch up to date: `git fetch origin main && git merge origin/main`. Merge, don't
   rebase: rebasing rewrites commits other people may have checked out. Never force-push a branch
   someone else has.
2. Resolve conflicts as described below, then run the checks again: `npm run build:manifest`,
   `npm run check`, and the browser tests the change touches.
3. Push, and wait for CI to go green on that new head.
4. Merge only if `main` hasn't moved again in the meantime. If it has, go back to step 1.

### The repository's settings

GitHub enforces all of that. There's no merge queue, because that's only for repositories owned by
an organisation and this one belongs to a person. These are the settings as they stand; keep this
table current (the standing rule). The ruleset and pull requests' settings were last read back on
2026-11-11, as below (`gh api repos/hoffspot/conquest/rulesets/24459327` and
`gh api repos/hoffspot/conquest`). The secret and the deploy key were last checked on 2026-10-16,
when the private repository for the licensed models was set up: the secret shown by CI fetching
the models with it; the deploy key read back by the owner.

| Where | Setting | As it is |
| --- | --- | --- |
| *Settings → Rules → Rulesets*, the ruleset `main` | Enforcement | Active, on the default branch (`main`); nobody can bypass it, the owner included |
| | Restrict creations | On. It covers only creating `main` itself, which already exists, so it changes nothing day to day |
| | Restrict deletions | On |
| | Block force pushes | On |
| | Require a pull request before merging | On, with 0 approvals required. A maintainer reviews, but can't approve a pull request they opened themselves |
| | Require status checks to pass | On. Required checks, from GitHub Actions: `ci`. It alone since 2026-11-11 (below, *One required check*); read back that day, `strict_required_status_checks_policy` true |
| | Require branches to be up to date before merging | On. With the required checks, it's why CI needn't run on `main` again after a merge (section 2): neither is turned off without `push: branches: [main]` put back into `ci.yml` first |
| *Settings → General → Pull Requests* | Allow auto-merge | On |
| | Always suggest updating pull request branches | On (the *Update branch* button) |
| | Merge methods | Merge commits, squash and rebase are all allowed; this repository's convention is a merge commit |
| *Settings → Secrets and variables → Actions*, Repository secrets | `MODELS_DEPLOY_KEY` | The private half of the read-only deploy key on `hoffspot/conquest-models`, for the builds to fetch the licensed models (docs/LICENSED_MODELS.md). Set on 2026-10-16. `PELLAGOS_RELEASE_KEY`, for signing the world server's releases (`npm run release-key`), is the owner's to add when they make the release key |
| `hoffspot/conquest-models` (private) → *Settings → Deploy keys* | `conquest builds (read only)` | Read-only, fingerprint `SHA256:IQCk0zNoVFZVfSDSwMVncAy0QPQEcYYLmMecRgDtCh8`. To change it: docs/LICENSED_MODELS.md, *Changing the key* |

**One required check.** CI's `ci` job passes only if every other job did (section 2), so
requiring it alone requires them all, whatever they're called and however many there are. The
ruleset has required `ci` alone since 2026-11-11 (before, each job was required by name, `test`,
`motion` and `e2e (1 of 8)` to `e2e (8 of 8)`, so a job added, renamed or removed, or a
different number of `e2e` jobs, needed the ruleset changed with it, or every pull request
waited for a check that never came). To read it back: `gh api
repos/hoffspot/conquest/rulesets/24459327`, whose `required_status_checks` holds `ci` alone,
with `strict_required_status_checks_policy` true. A pull request opened before `ci` was added
gets the job when it's brought up to date with `main`, as it must be to merge anyway.

So:

- A job added to `ci.yml` goes in the `ci` job's `needs`, and that's all
  (`test/contribution.test.js` fails until it's there). A job in another workflow (`soak.yml`,
  `scale.yml`, `mac.yml`) isn't required, as before.
- The number of `e2e` jobs is two numbers in `ci.yml`, changed together: the `e2e` job's matrix
  (`shard: [1, 2, ...]`) and `E2E_SHARES`, which is always two more than the matrix is long (the
  `motion` and `test` jobs take the last two shares). The test fails if a share is left to no
  job or given to two, and until this file gives the new number of jobs. No setting changes
  with it. There are 12 (`shard` 1 to 12, `E2E_SHARES: 14`) since 2026-11-11, when the browser
  tests, drawn cheaply, came to 234 minutes of work from 379: `node scripts/e2e-shard.js 1 14
  --ahead 13:13,14:20` says what each job's given, about 19 minutes. More wouldn't end a run
  sooner, as the unit tests take about 22 minutes whatever the others do (the review of
  2026-11-11 had worked out 18 jobs and a run of 27 minutes from the 379); and a run of 14 jobs
  leaves 6 of the 20 GitHub runs at a time for the account, where 20 would leave a second pull
  request's run waiting. Work it out again with that command when the tests' times change much.

**The routine for a pull request** is: *Update branch* on it (it merges `main` in), then *Enable
auto-merge*. GitHub merges the pull request once it's green on that up-to-date head. If `main`
moves first, update the branch again.

**Conflicts in files no one should merge by hand:**

| File | What to do |
| --- | --- |
| `client/js/app/manifest.js`, `client/js/app/assets.js`, the import map in `client/index.html` | Take either side, then `npm run build:manifest`. They're generated from everything under `client/` and from `client/models/assets.json` (which is merged by hand: keep both sides' models); the rest of `index.html` is merged by hand as any file is. |
| `client/js/characters/clip-keys.js` | Generated: take the side whose `scripts/bake-clips.js` list you keep, then `npm run build:clips -- --from=...` (above) if both changed it, and `npm run build:manifest`. A clip rest's `hitAt` and `duration` in `client/js/core/roles.js` are its clip's `hit` and `seconds` there. |
| `client/js/core/setpieces/outlines.js` | Generated: take either side, then `npm run build:footprints` on the merged code, and `npm run build:manifest`. |
| `client/characters/vitruvian.json`, `vitruvian.bin`, `vitruvian/masks/*.png` | Generated together: take one side's three, never a mix, then `npm run build:vitruvian -- --from=...` (above) if both sides changed what it's made from (`scripts/build-vitruvian.js` or the MakeHuman body), and `npm run build:manifest`. |
| `package-lock.json` | Take `main`'s, then `npm install` to bring your own dependency changes back in. |
| `e2e/durations.json` | Take both sides' entries. Re-time your own tests if they changed (section 2). |
| `test/motion-baseline.json` | Take `main`'s, then `npm run check:motion` on the merged code. Run it with `--update` only for what your own change meant to make different, and say so. |
| `NET_VERSION`, `SAVE_VERSION` | If both sides bumped one, take the higher number and add one. The merged game is different from both. |
| `SNAPSHOT_VERSION` | If both sides bumped it, take the higher number and add one, keep both sides' steps in `SNAPSHOT_STEPS` (renumbered one after the other, the older side's first), and run `npm run snapshot-fixture` on the merged code for the new number's fixture. Keep both sides' older fixtures. |
| `WAR_VERSION` | If both sides bumped it, take the higher number and add one, and keep both sides' steps in `War.restore`, the older side's first, each for a war kept before the merged number. |
| `LAYOUT_VERSION`, `CONFIG_VERSION`, `FORMAT_VERSION`, `SECRETS_VERSION`, `ACCESS_VERSION` | If both sides bumped one, take the higher number and add one, and keep both sides' steps (`LAYOUT_STEPS`, `SETTINGS_STEPS`, `FORMAT_STEPS`, `SECRETS_STEPS`, `ACCESS_STEPS`), one after the other, each numbered for the version it starts from. |
| `docs/*.md`, the plans in `generated/` | Keep both sides' text. Change-log entries stay in date order. |

**Claude sessions merging their own pull requests** (only where the owner has said so): bring the
branch up to date and have CI green on that head, as above. Use auto-merge where it's turned on,
and merge by hand only when `main` hasn't moved since the green run.

## Working with Claude Code: what to ask for

A good first message in a session:

> Read contribution.md and CLAUDE.md. Then: <the change>. Branch from the latest main, follow the
> conventions there, add tests, run `npm run build:manifest`, `npm run check` and the browser
> tests the change touches, show me the diff and the pictures, and only then commit and push.
> Don't open the pull request until I say so.

- Keep Claude's permission prompts on for `git push` and anything that leaves your machine.
- Claude Code on the web can watch your pull request: ask it to subscribe to the pull request's
  activity, and it will answer review comments and fix CI failures as they come in.
- If Claude says it can't reach something (GitHub, the npm registry, a host it needs), it's your
  environment's settings, not the code. Its message says where to change them.
- Claude follows the rules here, but you're the contributor: review what it pushes as your own
  work.

## When something goes wrong

| What you see | What to do |
| --- | --- |
| `manifest.test.js` fails: "is up to date" | `npm run build:manifest`, and commit `client/js/app/manifest.js`, `client/js/app/assets.js` and `client/index.html` |
| `manifest.test.js` fails: "within its budget" | What's downloaded before the game starts has grown past `BOOT_BUDGET`. Move a heavy model to the catalog (section 3, rule 9), or raise the budget and say why in the pull request |
| `contribution.test.js` fails | You changed the pipeline: update this file (the standing rule) |
| The Blender pipeline's `npm test` says `dist/` differs | `npm run build` in `utilities/blenderpipeline`, and commit `dist/` |
| The Blender pipeline says "No Blender to run" | `npm run setup` there (it needs Python 3.11), or set `BLENDER` to a Blender 4.2 or later |
| Browser tests can't find Chromium | `npx playwright install chromium`, or set `CHROMIUM_PATH` to a Chromium or Chrome |
| Browser tests time out locally | Run fewer at once (`--workers=1`), and close other heavy programs: drawing without a GPU is slow |
| The port's in use | `E2E_PORT=8096` for the tests, `PORT=3000` for `npm start` |
| `npm ci` fails in a cloud session | The environment's network access must let the npm registry through, and its setup script be `npm ci` |
| A conflict in `manifest.js`, `assets.js`, `index.html`'s import map, `package-lock.json` or a version number | Section 6: regenerate it or take the higher number; don't merge it by hand |
| The `motion` job fails | Its `WORSE:` lines say which motion, on which body, and what. Draw them: `npm run check:motion`, then `/motion-sheet.html?new=1` (section 2) |
| A pull request waits on "Expected — Waiting for status to be reported" | A required check that CI doesn't run there. If it's `ci`, the branch is older than the job: bring it up to date with `main`. If it's another, a job was renamed or removed, or the number of `e2e` jobs changed, while each was still required by name: the owner updates the ruleset (section 6, *One required check*) |
| The `ci` job failed | It runs nothing of its own: its log says which job didn't pass (failed, cancelled or skipped). Look at that one. *Re-run failed jobs* runs it and `ci` again |
| A job failed at *Install Chromium for the browser tests* after three 5-minute tries, or an `e2e` job was ended at 80 minutes | Playwright's download hung: not your change. *Re-run failed jobs* on the run. If its log says a library is missing, the runner's image changed: CI installs Chromium without `--with-deps` (apt-get there has hung for good), so add the library to the step |
| A job was still running its browser tests when it was ended, or the same job ends long after the others run after run | Tests added without being timed each count for the median (about 55 s), so a job can get more than its share of slow ones: time them by the run's reports (`npm run e2e:durations`, section 2) and commit `e2e/durations.json`. If the unit tests or the motion check have grown, change their minutes in `ci.yml`'s `E2E_AHEAD`. If every job has grown, raise `timeout-minutes` in `ci.yml` to about twice the work a job is given, and say why in the pull request. (One run's jobs ending 20 or 30 minutes apart, a different job last each time, is the runners' speeds: section 2, *How long it takes*) |
| Another CI job "has exceeded the maximum execution time" | It ran far longer than it ever has (section 2, *How long it takes*). A unit test or the motion check that hangs (a promise that never settles, a loop that never ends) is the usual reason: run the job's checks locally. If it was only slow, raise its `timeout-minutes` in `.github/workflows/`, and say why in the pull request |
| A CI job cancelled after about 15 minutes, with no steps and no logs | It was never given a runner: GitHub's doing, not your change. *Re-run failed jobs* on the run |
| CI was green, but red after merging `main` in | Someone else's change and yours don't fit together. Fix it on your branch before merging (section 6) |
| There's no CI run on `main` after a merge | As it's meant to be (section 2): the pull request's last run tested those very files. To run it on `main` all the same: the Actions tab, CI, *Run workflow* |
