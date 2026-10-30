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
> changed (a CI job added, renamed or removed; a different number of browser test jobs; a new
> rule for `main`), say so to the owner, with the exact steps, in the pull request and in your
> session. Update the settings table in section 6 in the same pull request, and check that the
> owner has made the change before it's merged. Whenever a setting is changed or added, the table
> is updated to match.

The rule is written down three times, so no one can miss it:

- here;
- in `CLAUDE.md`, which Claude Code reads at the start of every session in this repository;
- in `test/contribution.test.js`. It fails when an npm script, a workflow, a CI job or the Node
  version changes and this file hasn't been updated to match, and when a CI job isn't among the
  required checks in the settings table. That test is the part of the rule a machine can check;
  everything else is up to you and your reviewer.

## What you need

- A GitHub account.
- Claude Code: the command line, the desktop app, or Claude Code on the web
  (<https://claude.ai/code>). It runs on your own Claude plan, so its usage is yours.
- Node.js 22 or newer (`package.json`'s `engines`; CI uses 22).
- Chromium for the browser tests. Playwright downloads it, or you point it at one you already
  have with `CHROMIUM_PATH`.
- Only for the licensed models (the Dreadthorn's, the werewolf's, the centipede's, the Ant
  Monster's, the ant's, the two spiders', the scorpion's, the cockroach's, the wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', and the kaiju's): access to the private repository
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

CI (`.github/workflows/ci.yml`) runs on every pull request, and on `main` when one is merged. A
pull request's run is cancelled when you push to it again; only its newest commit's run counts.
`main`'s runs always run to the end. A job that hangs is ended at about twice the longest it
should take, rather than held to GitHub's 6 hours: `test` at 60 minutes (its own work about 19½,
then its share of the browser tests about 8), `motion` at 60 (about 13, then about 15), each
`e2e` job at 80 (about 28; its Chromium download is tried three times, 5 minutes a try). Every
job ends about together, about half an hour in.

| CI job | What it runs | Locally |
| --- | --- | --- |
| `test` | the licensed models fetched (below), `npm ci`, then `npm run lint` (ESLint) and `npm test` (Node's test runner, `test/*.test.js`, four files at a time); then its share of the browser tests (share 10, below) | `npm run check`, which runs both |
| `e2e` (8 jobs side by side) | the licensed models fetched, then each job's share of the Playwright browser tests (`e2e/*.spec.js`: shares 1 to 8, below) | `npm run test:e2e`, or only the tests you touched (below) |
| `motion` | `npm run check:motion`: the motion check (below), failing on anything worse than its baseline. Its report is kept with the run as `motion-report`. Then its share of the browser tests (share 9, with the licensed models) | `npm run check:motion` |

**The browser tests' shares.** They're split ten ways, by how long each took on CI
(`scripts/e2e-shard.js`, `e2e/durations.json`): a share for each `e2e` job, and one each for the
`motion` and `test` jobs once their own work's done, given that much less (`ci.yml`'s
`E2E_SHARES` and `E2E_AHEAD`: `9:13,10:20`, the minutes each does first), so that every job ends
about together. Each job runs its share with `.github/actions/e2e-share` (Chromium installed, the
share chosen and run), and its JSON report is kept with the run as `e2e-report-<share>`, failed
or not: how long each test took there, to time them by (below). If the unit tests or the motion
check take much longer or shorter, change their minutes in `E2E_AHEAD`.

**The licensed models** (`docs/LICENSED_MODELS.md`) are kept in the private repository
`hoffspot/conquest-models`. Every job that needs them starts with `.github/actions/licensed-models`:
it checks that repository out into `.models` with the read-only deploy key (its private half the
secret `MODELS_DEPLOY_KEY`), and puts its files in place under `client/`, each checked against the
hash and size the catalog keeps (`scripts/licensed-models.js`). From then on, the tests that need
one fail if it's missing (`LICENSED_MODELS=required`); elsewhere they say they're left out. A
fork's pull request is given no secrets, so its run leaves them out, with a notice; anywhere else,
no key fails the job. A maintainer brings a fork's pull request into a branch here before it's
merged.

`.github/workflows/pages.yml` runs when `main` changes: the licensed models fetched, lint and the
unit tests again, then `npm run build:manifest`. It copies `client/` and writes into the copy which code it is, for the
debug log: the commit and the time, in place of `client/js/app/version.js`'s noughts
(`scripts/stamp-version.js`; as kept in the repository, the game says it's "dev"). Then it
publishes the copy to GitHub Pages
(<https://hoffspot.github.io/conquest/>); its build is ended at 30 minutes (it takes about 13½)
and its deploy at 15.
Whatever is merged to `main` goes live, so `main` must always be green.

`.github/workflows/soak.yml` is the cross-engine soak (`npm run soak`, below). It's run by hand
from the Actions tab (Soak, Run workflow: how many minutes, the seed, which browsers), and for
three minutes on a pull request that changes the soak itself (`scripts/soak.js`,
`client/js/core/bot.js` or the workflow). It installs Chromium, WebKit and Firefox with their
system libraries, keeps its report with the run as `soak-report`, and is ended at 30 minutes on a
pull request and 4 hours by hand. It isn't a required check: most pull requests never run it.

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
`scripts/build-mac-app.js`, `scripts/stamp-version.js`, the licences or the workflow), one run at a
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
| `npm start` | Serves the game and the multiplayer relay (kept for one release: a world server's broker takes its place) on port 8080. Open `/?play` to go straight into a game (`&seed=12`, `&people=elf`, `&quality=low`) |
| `npm run dev` | The same, restarting the server when its code changes |
| `npm run world-server` | The world server (`generated/world_server_plan.md`), on port 8480: worlds kept on the server, run in threads of their own, reached from the Wi-Fi, and from the internet over TLS alone once it has a certificate and **Answer the internet** is on (its `internet` setting; a certificate of the owner's own is put in on the management page, or as `certificates/server.key` and `server.crt` in its data folder; or the server gets free ones from Let's Encrypt itself, set up on the management page: a DuckDNS name, a domain on Cloudflare or deSEC, or the home's IP address, with the DNS host's token kept in the Keychain on macOS, elsewhere in `certificates/tokens.json`. Its tests use a certificate authority of their own, `test/fake-acme.js`, and never reach Let's Encrypt or a DNS host; while it answers the internet it asks the home's router to forward its port (PCP, NAT-PMP or UPnP; **Ask the router** in Settings), and its tests ask a router of their own, `test/fake-router.js`, never the machine's real one; or, for a home whose provider shares its address, it lets the internet in through Tailscale Funnel (**Tailscale Funnel** on the management page, its `funnel` setting: Tailscale installed and signed in on the computer, Funnel allowed on the tailnet), which brings it to a tunnel listener on `127.0.0.1:8482`; its tests use a Tailscale of their own, `test/fake-tailscale.js`, never the machine's). `-- --port 9000 --data /tmp/worlds` for another port and data folder. The first start prints its admin key, once. Its management page is at `http://localhost:8481` on the same computer, needing no key (`-- --admin 9001` for another port), and at `/admin` on the play port from the Wi-Fi, with the admin key: its worlds (made, started, set aside, backed up, restored, exported, deleted), their keys, codes and players, its settings, what's happened, and its health. It shows itself to other servers on the Wi-Fi with Bonjour (macOS's `dns-sd`, or `avahi-utils` with avahi-daemon on Linux; its `bonjour` setting), and lists those it finds, which players add from **Worlds on servers** with a tap; macOS may ask for Local Network permission, and play carries on if it's refused. Worlds can also be made from the game it serves (the title's **Worlds on servers**: add the server, then Make a world), and the game's **Test this server** there tries its internet addresses from wherever the device is and tells the server's page how that went (from a phone on its cellular data, the page's code opens the game and tests it at once). A world a player opens to others from the game's menu (**Invite others**) goes through the server's broker (`/broker`): listed there if they like, and joined point to point (WebRTC), or relayed by the server when that can't be made (its `broker` and `relaying` settings); the tests use a WebRTC of their own, `test/fake-rtc.js`. `-- --app` runs it as the Mac app does (`mac/`, docs/MAC_APP.md): how it stands said on `@pellagos` lines, and stopped, every world saved, when its input closes. `server/world.js` is its launcher (`server/launch.js`): it runs the server itself (`server/serve.js`) as this version or a newer one an update installed in the data folder, starts it again after an update, and goes back to the version before if the new one fails. Updates are the management page's (Settings, Updates: a new version found once a day among the releases the Mac app workflow publishes, checked against GitHub's SHA-256 for its archive, or signed with the project's key where the server has its public half, installed when its owner clicks, or by itself overnight when nobody's in, its `autoUpdate` and `updateHour` settings; a copy of the repository is shown `git pull` instead); `-- --releases <url> --release-key <file>` looks for them elsewhere, as the tests do. A world exported from a server is brought in on the page's New world. The whole server is one archive (Settings, Archive; `server/storage/archive.js`): made, and restored in place of everything on a server with no worlds, or its worlds brought in as new ones (one too old to carry on started afresh from its seed). `-- --archive <file>` makes one from the data folder (the server stopped), and `-- --restore <file>` stages one to be put in place when it next starts (`--replace` where there are worlds). The owner's guide is docs/SERVER.md |
| `npm test` | Every change. The unit tests take a few minutes |
| `npm run lint` | Every change. ESLint must be clean |
| `npm run check` | Lint and the unit tests together: run it before every push |
| `npm run test:e2e` | Changes to the game in the browser: the screens, controls, HUD, drawing, multiplayer |
| `npm run check:motion` | Changes to how characters move or what they're built from: the body, bones, joints, walking, attacks, rests, items, clothes (below). About 5 minutes |
| `npm run balance` | Changes to how the wild answers the players' side, to whom it goes for (its enmity: docs/WILDS.md *Whom they go for*), or to how strong players, hirelings or creatures are: the balance runner (docs/WILDS.md, *Tuning it*), each side's fights at tiers 2, 5 and 8 (camped first, a player who falls out of that fight), with each side's share of what one alone loses beside its aim, and what its allies bore of the wild's blows (`borne`, `drawn`). A few minutes; `-- --tiers 5 --sides solo,four` for less. A fight goes one way or another by what's about, so a retune takes many: `-- --seeds 2,3,4,5,6,7,8,9 --fights 8` is 64 a side (each world's dice the same every run, so two settings are told apart on the very same fights) |
| `npm run snapshot-fixture` | After bumping `SNAPSHOT_VERSION` (section 4): a snapshot of a world as the new version keeps it, `test/fixtures/snapshots/<version>.json.gz`, for `test/snapshots.test.js` to bring forward and play on. A few seconds |
| `npm run step-budget` | Changes to the rules' steps, the navigation, or what's made ahead on the world server (`server/ahead.js`): a world stepped on Node as the world server will step it, four players walking about in four peoples' towns, every step timed. It fails if any step takes longer than a step (50 ms). About half a minute; `-- --seconds 600` for longer, `-- --no-ahead` to compare without making anything ahead |
| `npm run soak` | Changes to how the copies of a world keep to its host's: the rules' steps, netplay, the runner, what's made ahead (generated/world_server_plan.md §3.3). A world on Node with no host player, and players who play by themselves joined to it (`client/js/core/bot.js`) in Node, Chromium, WebKit and Firefox, each in their own people's town, starting fights; and one doing nothing, to be marked away and sent out. It fails if any copy is sent the world again once a player-hour or more, or sees anyone marked away or sent out at another step than the host. 32 minutes by default; `-- --minutes 5 --browsers chromium` for a quick look, `-- --browsers none` for Node's alone. WebKit and Firefox need `npx playwright install webkit firefox` first; `CHROMIUM_PATH` uses a Chromium you have. Its report is written to `test-results/soak/report.json` |
| `npm run soak:server` | Changes to how the world server runs a world for its players: the world's thread, the play socket, saving, what's made ahead (generated/world_server_plan.md §15 S9). A world server with 8 players in Node, each in a process of its own, playing by themselves (`client/js/core/bot.js`), for two hours. It fails if the world's memory grows more than 15% after the first hour, if any minute's 99th-percentile step takes 50 ms or more once they're all in, or if anyone's sent out. Run it with nothing else on the machine: the players' copies of the world share its cores (they run at a lower priority, as if on devices of their own, and each minute's line says how busy the world's thread was and how many of buildings' insides' tiles it baked, besides its steps). `-- --minutes 10 --players 4` for a quick look. Its report is written to `test-results/server-soak/report.json` |
| `npm run e2e:durations` | After adding browser tests, or making them much slower or quicker: times them by a CI run's reports (below) |
| `npm run build:manifest` | After changing anything under `client/`. It lists what the game downloads before it starts (`client/js/app/manifest.js`, every file with the hash of its bytes), the catalog of models downloaded only as they're wanted (`client/js/app/assets.js`, from `client/models/assets.json`), and the import map in `client/index.html` (every module at its address with its hash, and `main.js`'s own: generated/game_delivery_plan.md). The unit tests fail until you do. A browser that's run the game keeps every file by its hash and never asks for it again: after editing code, build the manifest before reloading, or the page asks for (and gets) the version it had |
| `npm run scramble` | Only when adding or remaking a licensed model (docs/LICENSED_MODELS.md): `-- <model.glb> <model.bin> --copyright "<whose it is>"` scrambles the model `utilities/blenderpipeline` made, as the game serves it, with whose it is stamped in it (its glTF asset's `copyright`), and checks it comes back. The scrambled copy goes in the private repository `hoffspot/conquest-models`. Its catalog entry in `client/models/assets.json` is marked `"licensed": true`, with its hash and size, and `test/scramble.test.js` checks every one so marked is scrambled, and no other. Then `npm run build:manifest` |
| `npm run models:fetch` | For the licensed models (the Dreadthorn's, the werewolf's, the centipede's, the Ant Monster's, the ant's, the two spiders', the scorpion's, the cockroach's, the wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', and the kaiju's), if the owner's given you access to the private repository `hoffspot/conquest-models` (docs/LICENSED_MODELS.md): clones it into `.models`, or brings it up to date, and puts its files in place under `client/`, each checked against the hash and size its catalog entry keeps. git ignores both. Without it the game draws the stand-ins, and the tests that need one say they're left out |
| `npm run build:characters` | Only when rebuilding the body from MakeHuman's MPFB2 (`-- --mpfb2=../mpfb2`). Then `npm run build:vitruvian`, which carries its shapes over |
| `npm run build:vitruvian` | Only when rebuilding the Vitruvian body (`client/characters/vitruvian.*` and its masks) from CharMorph's Vitruvian, or after rebuilding the MakeHuman body, whose shapes it carries over. It needs Vitruvian's files, and its `char.blend` is in Git LFS: `git clone --depth 1 https://github.com/Upliner/CharMorph-Vitruvian ../charmorph-vitruvian`, then fetch `char.blend` on its own as the top of `scripts/build-vitruvian.js` says, then `-- --from=../charmorph-vitruvian`. About 4 minutes. Then `npm run build:manifest` |
| `npm run build:music` | Only when remaking the music's instrument recordings (from the VCSL and VSCO 2 CE, each score's notes: `client/js/audio/scores.js`) |
| `npm run build:sounds` | Only when remaking the recorded sounds (`client/sounds` and `client/js/audio/recorded.js`: footsteps, and the recipes in `scripts/sounds`). It downloads their CC0 and public-domain recordings once, into `.cache` (about 700 MB: Freesound's previews, the VCSL's samples, the National Park Service's, OpenGameArt's, Kenney's and an itch.io pack whole), and takes a few minutes. `npm run build:sounds -- kaijuCall kaijuStep` makes only the sounds named again, from only their recordings, and keeps the rest as `recorded.js` has them (each must be there already): for adding or changing a few, or where Freesound can't be reached. Then `npm run build:manifest`, and describe any new sound in `client/js/audio/catalog.js` |
| `npm run build:props` | Only when remaking the dungeons' and the shops' furniture, dressing and wares (`client/models/dungeons`, its `LICENSE.md` and their entries in `client/models/assets.json`), or one of them (`npm run build:props -- skull bones`). It downloads each model once, into `.cache` (Poly Haven's, OpenGameArt's, and museums' and makers' scans and models on Zenodo and Objaverse: about 230 MB in all), makes each simpler and its pictures smaller and KTX2 (ETC1S, which the graphics card keeps compressed: `scripts/lib/ktx2.js`, with the `ktx2-encoder` package), and takes about ten minutes for all of them, most of it making the KTX2 pictures. A new model must be CC0 or CC BY (its maker named in `PROPS`' `by`, which the `LICENSE.md` it writes lists, and credited in `README.md`), downloadable without an account, and within `test/furnishings.test.js`'s budget (650 KB a file, 22 MB in all, its pictures KTX2). Node's own `fetch` ignores `HTTPS_PROXY`: behind a proxy, run it with `NODE_USE_ENV_PROXY=1` (Node 22.21 or later). Then `npm run build:manifest` |
| `npm run build:textures` | Only when remaking the dungeons' photographs (`client/textures/dungeons`, `client/js/world/dungeonpictures.js` and their entries in `client/models/assets.json`). It downloads their CC0 scans once, into `.cache` (about 45 MB from ambientCG and Poly Haven), makes each a KTX2 (`scripts/lib/ktx2.js`: the colour ETC1S, the normal map UASTC), and takes about a minute. Then `npm run build:manifest` |
| `npm run build:clips` | Only when remaking the character lab's animation clips, or the clips baked into the game's attacks, rests, guards' sway, flinches and dodges (`client/js/characters/clip-keys.js`, from `scripts/bake-clips.js`'s list, baked on MakeHuman's body whichever the game plays on: `BAKE_BODY`; a rest's timing in `client/js/core/roles.js` is its clip's, which the tests check). It needs Mesh2Motion's files: `git clone --depth 1 https://github.com/Mesh2Motion/mesh2motion-app ../mesh2motion-app`, then `-- --from=../mesh2motion-app/static/animations` |
| `npm run build:mac` | Changes to the Mac app (`mac/`) or what its bundle holds: on a Mac, after `swift build -c release --arch arm64 --package-path mac`, `-- --executable <its PellagosServer>` makes `dist/Pellagos Server.app` (Node arm64 from nodejs.org, checked against its `SHASUMS256.txt` and the hash kept in `NODE`, its own signature kept; the server and the game), signs it ad hoc and zips it; with the server's archive and Homebrew formula beside it. Elsewhere `-- --no-executable` makes the rest of the bundle, unsigned. Node's archive is kept in `.cache/node`. To move to a newer Node, change `NODE` (its version and its archive's SHA-256 from that release's `SHASUMS256.txt`). `test/mac-app.test.js` checks the bundle without a Mac; the macOS workflow builds it on one (above) |
| `npm run release-key` | For the project's owner, if they want releases signed as well as checked against GitHub's SHA-256 (docs/SERVER.md, "Releasing"): `-- --new <file outside the repository>` makes the release key pair once (the public half into `server/update/release-key.pem`, to commit; the private half kept by the owner alone, never committed), `-- --sign <archive> --key <file>` signs a release's archive (or with `PELLAGOS_RELEASE_KEY`, as the Mac app workflow does), `-- --verify <archive>` checks it |
| `npm run build:pointers` | Only when redrawing the mouse pointers (`client/images/pointer/`: the sword, its looks over things and shaken, each size at 1x and 2x, drawn in `scripts/build-pointers.js` from what `client/js/app/pointer.js` asks for). It rasterizes them with Playwright's Chromium (or `CHROMIUM_PATH`'s), in a second or two. `test/pointer.test.js` fails while one is missing or the wrong size. Then `npm run build:manifest` |
| `npm run build:backdrops` | Only when adding or changing the paintings behind the loading screen and the title (`client/images/backdrops/`, the scenes in `client/js/app/backdrop.js` `BACKDROPS`). Put each scene's master in `scripts/backdrops/` as `<scene>-tall` and `<scene>-wide` (as it's painted: a scene may be only one), a JPEG or a PNG, the owner's own (they're the repository's, under its licence) or CC0, and add it to `BACKDROPS`. It makes each an AVIF and a WebP at its master's size, or no more than 2560 pixels its longest side (`BACKDROP.most`: a 2K master, 2752 by 1536, is made 2560 by 1428), with ffmpeg (which needs libaom-av1 and libwebp), in a few seconds. `test/backdrop.test.js` fails while one is missing, the wrong way round, or over its budget (100 KB an AVIF, 150 KB a WebP). Then `npm run build:manifest` |
| `npm run build:crest` | Only when changing the crest over the loading screen and the title (`client/images/crest/`, `client/js/app/crest.js`). Put its master in `scripts/crest/` as `crest.jpg` or `crest.png`, painted on flat magenta (as near #FF00FF as it comes: the magenta's measured at its corners, and it stops if they aren't magenta), the owner's own (it's the repository's, under its licence) or CC0, 1376 by 768 pixels as `CREST.size` has it (or change that, and where its ribbon and eyes are: `CREST.ribbon`, `CREST.eyes`, and `.crest-name`, `.crest-eye` and `.crest-lid` in `client/styles.css`). It cuts the crest out of the magenta and makes an AVIF and a WebP, both see-through, with ffmpeg (which needs libaom-av1 and libwebp), in a few seconds. `test/crest.test.js` fails while either is missing, not see-through, not its master's size, or over its budget (120 KB the AVIF, 200 KB the WebP), or while the page's and the styles' places aren't `CREST`'s. Then `npm run build:manifest` |
| `npm run build:footprints` | After changing how a prop or a yard's fence looks (`client/js/world/art/kits/props.js`, `peoples/props.js`, `kits/yards.js`): measures what each stands on into `client/js/core/setpieces/outlines.js`, which the navigation mesh walks round. `test/footprints.test.js` fails until you do. Then `npm run build:manifest` |
| `npm run vendor:three` | Only after changing the `three` version in `package.json`, or which of its add-ons the game uses (`ADDONS` in `scripts/vendor-three.js`, with the Basis Universal transcoder for KTX2 textures; the licences their packages don't carry are kept in `scripts/licences/`). Then `npm run build:manifest` |
| `npm run vendor:meshopt` | Only after changing the `meshoptimizer` version |
| `npm run vendor:ed25519` | Only after changing the `@noble/ed25519` or `@noble/hashes` version: bundles what the game checks a world server's identity with (`client/js/core/identity.js`) and makes and proves the player's own with (`client/js/core/player.js`). Then update their import paths and `npm run build:manifest` |
| `npm run vendor:qrcode` | Only after changing the `qrcode-generator` version: copies the QR code maker the world server's management page draws its invites with (`client/admin.html`). Then update its path in `client/js/admin/page.js` and `npm run build:manifest` |
| `npm run vendor:recast` | Only after changing the recast-navigation version. It also makes Recast's WebAssembly start with 16 MB of memory, not the 64 MB it's built with (`STARTING_MEMORY`, by `scripts/wasm-memory.js`); `test/release.test.js` checks it. Then `npm run build:manifest` |

### The browser tests

They play the game in Chromium, in software without a GPU, so they're slow (each has 2 minutes).
Run the ones your change touches, one at a time:

```sh
CHROMIUM_PATH=/opt/pw-browsers/chromium E2E_PORT=8096 \
  npx playwright test e2e/pellagos.spec.js -g "<part of the test's name>" --workers=1 --reporter=line
```

- `E2E_PORT` picks the port for the test server, so it doesn't clash with a game you're running
  (the default is 8095).
- `rm -rf test-results` first, if an earlier run left its pictures and traces there.
- A test that waits on the game's time stops the game and plays it on by hand (`playUntil` in
  `e2e/pellagos.spec.js`). Do the same in new tests, and never wait on the clock.
- Time the tests by how long they took on CI, so its split stays even: once a run's done, its
  ten reports (`gh run download <run> -p 'e2e-report-*' -D reports`, or the run's page,
  Artifacts), then `npm run e2e:durations -- reports/*/e2e-report.json`. Commit
  `e2e/durations.json`, not the reports. Do it after adding browser tests, making them much
  slower or quicker, or whenever CI's `e2e` jobs end far apart.
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
npm run check:motion                      # everything (about 5 minutes, all your threads)
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
  and `notes.json` (which texture each material takes). Unreal can't run here, so its tests run on
  a stand-in for Unreal's Python module (`python3 unreal/test_export_assets.py`; `npm test` runs
  them too).

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
     the undergrowth, hedges, ground and building atlas do. On a phone the graphics card shares
     the page's memory, so the copy costs twice. Don't for anything read again: a character's
     garment pictures are. (A game character's skin is let go of once it's sent, as it's painted
     again whole whenever it changes. A drawing lost and given back then loads the page again,
     where the player was: `docs/GAME.md`.)
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
     holds, and nothing else.
5. **Test it.** Add or update unit tests (`test/*.test.js`, `node:test`) for every change to the
   rules, the world or the tools, and a browser test (`e2e/`) for anything a player does on
   screen. Never skip, disable or loosen a test to get CI green: fix the cause. A test that
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
   wasp's, the black widow's, the greater demon's, the fiend's, a hell's six flayed's, six gorgers', henchman's and walkers', and the kaiju's: bought, and in the game with permission (the Dreadthorn's the repository's owner obtained, the others' their
   Fab Standard License gives), only in their converted form, and scrambled
   (`npm run scramble`). They aren't in this repository either, but in the private
   `hoffspot/conquest-models`, which the builds fetch (`npm run models:fetch` for your own copy,
   with access to it; `docs/LICENSED_MODELS.md`). Their licence note is
   `client/models/beasts/LICENSE.md`. Another exception is the owner's call, never a
   contributor's. Third-party code goes in `client/vendor/` through a `scripts/vendor-*.js`
   script.
9. **Heavy models go in the catalog, not in what's downloaded before the game starts.** That has
   a budget, `BOOT_BUDGET` in `test/manifest.test.js` (15 MB), and raising it is a choice to make
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
3. CI runs: the `test` job, the `motion` job and the 8 `e2e` jobs, about half an hour. A first-time contributor's
   CI may wait for a maintainer to approve the run.
4. If CI fails, read the failing job's log, reproduce it locally, fix it and push again. A
   failure is never "just flaky" until a re-run of the same commit passes and you know why it
   failed. Don't push empty commits, or close and reopen the pull request, to set CI going again.
5. If `main` moves on, bring your branch up to date (section 6).
6. Answer every review comment: change the code, or say why not.
7. A maintainer merges it, with a merge commit, once CI is green on a head that's up to date with
   `main` and it's been reviewed. Don't merge your own pull request unless the owner has said you
   may. Once it's merged, GitHub Pages publishes the game from `main`.

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
table current (the standing rule). They were last checked on 2026-10-16, when the private
repository for the licensed models was set up: the ruleset and pull requests' settings read back
as below; the secret shown by CI fetching the models with it; the deploy key read back by the
owner.

| Where | Setting | As it is |
| --- | --- | --- |
| *Settings → Rules → Rulesets*, the ruleset `main` | Enforcement | Active, on the default branch (`main`); nobody can bypass it, the owner included |
| | Restrict creations | On. It covers only creating `main` itself, which already exists, so it changes nothing day to day |
| | Restrict deletions | On |
| | Block force pushes | On |
| | Require a pull request before merging | On, with 0 approvals required. A maintainer reviews, but can't approve a pull request they opened themselves |
| | Require status checks to pass | On. Required checks, from GitHub Actions: `test`, `motion` and `e2e (1 of 8)` to `e2e (8 of 8)` |
| | Require branches to be up to date before merging | On |
| *Settings → General → Pull Requests* | Allow auto-merge | On |
| | Always suggest updating pull request branches | On (the *Update branch* button) |
| | Merge methods | Merge commits, squash and rebase are all allowed; this repository's convention is a merge commit |
| *Settings → Secrets and variables → Actions*, Repository secrets | `MODELS_DEPLOY_KEY` | The private half of the read-only deploy key on `hoffspot/conquest-models`, for the builds to fetch the licensed models (docs/LICENSED_MODELS.md). Set on 2026-10-16. `PELLAGOS_RELEASE_KEY`, for signing the world server's releases (`npm run release-key`), is the owner's to add when they make the release key |
| `hoffspot/conquest-models` (private) → *Settings → Deploy keys* | `conquest builds (read only)` | Read-only, fingerprint `SHA256:IQCk0zNoVFZVfSDSwMVncAy0QPQEcYYLmMecRgDtCh8`. To change it: docs/LICENSED_MODELS.md, *Changing the key* |

**Every CI job is a required check.** A job that's added must be added to the ruleset once it has
run on a pull request (GitHub only offers checks it has seen). A job that's renamed or removed must
be changed in or taken out of the ruleset, or every pull request waits for a check that never
comes. The same goes for the number of `e2e` jobs: each is required by its name, `e2e (N of 8)`.
Only the owner can make these changes, so ask them, with the steps:

1. *Settings → Rules → Rulesets → main → Require status checks to pass → Add checks*.
2. Type the job's name, and choose the one from GitHub Actions. Remove any check that no longer
   exists.
3. *Save changes*.

Then the routine is: *Update branch* on the pull request (it merges `main` in), then *Enable
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
| A pull request waits on "Expected — Waiting for status to be reported" | A required check that CI no longer runs (a job renamed or removed). The owner updates the ruleset (section 6, *The repository's settings*) |
| A job failed at *Install Chromium for the browser tests* after three 5-minute tries, or an `e2e` job was ended at 80 minutes | Playwright's download hung: not your change. *Re-run failed jobs* on the run. If its log says a library is missing, the runner's image changed: CI installs Chromium without `--with-deps` (apt-get there has hung for good), so add the library to the step |
| A job was still running its browser tests when it was ended, or the jobs end far apart | Tests added without being timed each count for the median (about 40 s), so a job can get more than its share of slow ones: time them by the run's reports (`npm run e2e:durations`, section 2) and commit `e2e/durations.json`. If the unit tests or the motion check have grown, change their minutes in `ci.yml`'s `E2E_AHEAD`. If every job has grown, raise `timeout-minutes` in `ci.yml` to twice the longest, and say why in the pull request |
| Another CI job "has exceeded the maximum execution time" | It ran twice as long as it ever has. A unit test or the motion check that hangs (a promise that never settles, a loop that never ends) is the usual reason: run the job's checks locally. If it was only slow, raise its `timeout-minutes` in `.github/workflows/`, and say why in the pull request |
| A CI job cancelled after about 15 minutes, with no steps and no logs | It was never given a runner: GitHub's doing, not your change. *Re-run failed jobs* on the run |
| CI was green, but red after merging `main` in | Someone else's change and yours don't fit together. Fix it on your branch before merging (section 6) |
