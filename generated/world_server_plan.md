# The world server: the plan

A plan, built: S0 to S9 are done, from worlds on the Wi-Fi to the open internet port (S6), the
broker with players' own worlds (S7), the Mac app (S8) and running it for real (S9: bringing worlds
in, signed updates that roll back, and a two-hour soak with 8 players). What's left is the owner's:
the checks on a Mac, the project's release key and a first signed release
([§15](#15-milestones)). It is a living
document. Each milestone updates it as it lands, and the [change log](#18-change-log) at the end
records every change and why.

**Goal.** A standalone server that a player runs on their own Mac (macOS 27.0.1, Apple Silicon).
It keeps one or more Pellagos worlds and runs them without a browser.

- **Drop in, drop out.** Players come and go while the world carries on, and no one has to stay in
  it for others to play.
- **The world's time.** It stops when the last player leaves and starts again when someone comes
  back.
- **Creating and joining.** A player can make a world from the game and then play in it.
- **Keys.** The world's creator shares a key with others. The same key gets them back in later.
  The key checks are hooks, so other ways of signing in can follow.
- **Finding worlds.** The listing shows:
  - the worlds on the servers a player knows;
  - other Macs on the same Wi-Fi;
  - people running the game in their browser who can be reached point to point, with the server
    brokering the WebRTC connection.

  Players can also type a server's DNS name or IP address and port.
- **Screens and protocol.** The server has its own management page and the game has a matching
  worlds screen. Both speak one documented protocol.
- **Heroes.** Each world chooses whether the server keeps the heroes or players bring their own.
- **Reach.** Anyone on the same Wi-Fi or across the internet, by typing the server's DNS name or IP
  address and port. No paid hosting.

**What it's measured against.** The self-hosted servers players already know:

| Server | What we take from it |
|---|---|
| Foundry VTT, a Node server that ships as a Mac app | Its setup screen of worlds |
| Factorio, Satisfactory, Minecraft | How they pause when empty |
| Satisfactory, Enshrouded, Minecraft Realms | Claiming a server, role keys, invite links |
| Palworld, V Rising | Their backups |

[§14](#14-what-other-servers-do-and-what-we-adopt) lists each feature we adopt and where it comes
from.

---

## 0. Decisions

These come from the user's brief and two rounds of questions on 12 October 2026. The change log
records both.

| Question | Decision | Why |
|---|---|---|
| Who reaches a world | **Anyone on the internet or the Wi-Fi, by DNS name or IP address and port.** The server opens one port, 8480 by default, to the internet. Players type `name:8480` or `ip:8480`, or follow an invite link. From the internet only TLS is accepted, with a free certificate every browser trusts: a DuckDNS name (suggested first), the owner's own domain, or the IP address itself. On the Wi-Fi the Mac also serves the game over plain http. Behind CGNAT, where no port can be opened, Tailscale Funnel is the fallback. No paid hosting. | User's choice. Safari won't open plain `ws://` from an HTTPS page, and an open port has to be safe ([§9](#9-reaching-the-server), [§13](#13-security)). |
| What strangers see | **The server's card and its listed worlds,** with player counts and hero names, as in Minecraft's server list. New worlds start unlisted, so only key holders see them until the owner lists them. | User's choice ([§8.1](#81-servers-the-player-knows)). |
| Where listings come from | **The server's own list, plus nearby Macs, plus players running the game.** No central directory. Each server lists its worlds. Servers find each other on the Wi-Fi with Bonjour. Players can also type a DNS name or IP address and port, and the game remembers it. | User's choice ([§8](#8-finding-worlds)). |
| Worlds hosted in a browser | **Kept, through the broker.** Today's "Invite others" stays: friends connect point to point, with any world server brokering the WebRTC connection. A browser world is listed as joinable once it has shown it can be reached directly. Otherwise it's listed as "through the server" when that server allows relaying, and hidden when it doesn't. Today's relay rooms, which nobody hosts, are retired. | User's choice ([§8.3](#83-players-running-the-game)). |
| Where heroes live | **Chosen per world.** Either the server keeps the heroes, up to 6 per player in each world, or players bring their own from their device as today. In kept worlds the owner decides whether a first hero must be new or may be brought in once. The owner can switch modes later, after a warning and a backup. | User's choice ([§6](#6-heroes-kept-by-the-world-or-brought-in)). |
| Players | **8 per world,** as today (`MOST_PLAYERS`). | Encounter scaling, bandwidth and snapshots are tuned for it. |
| Who makes worlds | **The server's admin, and anyone holding a creator key** the admin issues. Whoever makes a world owns it. | User's choice ([§7](#7-keys-identity-and-the-access-hooks)). |
| The server's display | **A management page the server serves itself.** On the Mac it needs no key. From the home network it needs the admin key. It's never reachable from the internet. A small menu-bar app comes later. | User's choice. Free to ship: no Apple notarisation needed ([§10](#10-the-servers-management-page)). |
| What runs a world | **The game's own rules (`core/`), unchanged, in Node.** Each running world gets its own `worker_thread`. The server speaks today's host protocol (`netplay.js`) to players, so joining needs almost no new game code. | `core/` already runs headless: the unit tests run the host, battle, war and navigation in Node, and `test/together.test.js` already hosts a world from Node on the real relay ([§1](#1-where-we-start)). |
| Time | **Stepped only while someone is in the world.** The clock freezes the moment the last player leaves. It starts again from exactly where it stopped once the first player back has finished loading, with no catching up for time away. It also freezes while every player's tab is hidden (a world setting, on by default). Sleeping or camping passes time only when everyone present is resting. | User's requirement. It's also the industry norm (Factorio, Satisfactory, Terraria, Vintage Story); worlds that keep running unattended draw "came back to a ruin" complaints (Palworld). |
| Idle players | **An "AFK" icon over the hero's head after 10 minutes without a command, and a kick after 30.** Until the kick they still count as present, so the world runs on around them. | User's choice ([§4](#4-a-worlds-life-and-its-time)). |
| Worlds at once | **2 running worlds by default,** changeable on the management page. The page recommends a maximum from the Mac's memory and CPU. An empty world is saved and unloaded after 2 minutes. | User's choice ([§10](#10-the-servers-management-page)). |
| What's saved | **The whole world.** Today only the war and each player's character survive a reload. The server saves the host's full snapshot, keeping 5 autosaves, 12 hourly backups and 7 daily ones, plus one before every update, migration or restore. | A shared world has to come back exactly as it was left ([§5](#5-saving-the-whole-world)). |
| Keys | **Long world keys with roles, short spoken codes, and a return ticket per player.** A key keeps working until its owner revokes or replaces it. A short code is valid 15–60 minutes and is traded once for a key. Trusted players may issue keys if the world allows it. A ban follows the player's ticket for good and their internet address for 24 hours. The game pins each server's identity on first contact. Every check goes through an access-policy hook, so passkeys or other sign-ins can follow ([§7](#7-keys-identity-and-the-access-hooks)). | User's choices, shaped by Satisfactory's claim and token rules, Enshrouded's role passwords, Realms' invite links and SSH's host keys. |
| Packaging | **From Terminal first (`npm run world-server`), then a free, ad-hoc-signed menu-bar app.** No Apple Developer ID. | User's choice. Terminal launches avoid macOS's Local Network prompt; nothing costs money ([§11](#11-on-the-mac)). |
| Other platforms and upgrades | **macOS first, built so Linux and Windows need little change.** Everything platform-specific sits behind one small layer. Settings and data carry version numbers with migrations, are backed up before each one, and are never opened by an older server, so an upgrade never loses data ([§5.1](#51-settings-versions-and-upgrades), [§11](#11-on-the-mac)). | User's choice. |
| Updates | **The page says when a new version is out, and the owner clicks to update.** Never while players are in, and always after a backup. | User's choice. |
| Keeping the Mac awake | **Automatic while players are in,** released when the last one leaves. A warning shows on battery or if the lid may close. | User's choice. |
| Rollout | **Playable milestone PRs:** server worlds on the Wi-Fi, then the open internet port, then browser worlds through the broker, then the menu-bar app. Main stays shippable throughout ([§15](#15-milestones)). | User's choice. Others contribute too. |

---

## 1. Where we start

These facts come from reading `origin/main` at 6aed84c, with measurements in Node 22.

**The server today** (`server/`, about 850 lines, no dependencies)
- **`index.js`** serves `client/` over plain HTTP. The only settings are `PORT` (default 8080) and
  `HOST`. There is no TLS.
- **`relay.js`** is a hand-written RFC 6455 WebSocket room relay at `/relay`. It runs no game
  logic.
  - **Joining.** Rooms have 4-letter codes and 72-bit reconnect tokens, compared in constant time.
  - **Limits.** 500 rooms, 15 peers a room, 4 MiB messages and an 8 MiB backlog.
  - **Keeping the link.** A ping every 20 s, a 60 s timeout and a 30 s grace to come back.
  - **What it lacks.** Origin checks, sign-in, room listing, metadata and persistence.
- **`static.js`** handles GET and HEAD, hashed URLs that are immutable, byte ranges and 304s.

**Hosting today**
- **Where the world runs.** `core/host.js` (9,107 lines) is the world. It runs in the hosting
  player's browser, created by `app/game.js` and stepped from its render loop.
- **What the host owns.** The battle (50 ms steps), the war (a turn every 60 s), the world near
  players and the wilds. Also caches, dungeons, items on the ground, shops, parties, followers and
  hired folk.
- **The protocol.** `core/netplay.js` (`NET_VERSION = 111`) is a replay protocol carried over the
  relay:
  - `Hosting` sends a joiner a full snapshot in `welcome`, then streams recorded ops (`a`, `c`,
    `j`, `l`, `p`, `v`, `k`) plus a motion stream every 4 steps.
  - Joiners replay them in `Joining`.
  - A checksum every 100 steps, or motion more than 1 cm off, triggers a snapshot resync.
- **Joining.** The joiner sends `hello {version, character}`. The host checks `NET_VERSION`, caps
  players at `MOST_PLAYERS = 8`, cleans up the character and trusts its gold and pack.
- **When the host leaves, the world ends for everyone.** There's no handing the host over to
  someone else.
- **No relay is hosted anywhere.** The GitHub Pages build's default relay address,
  `wss://hoffspot.github.io/relay`, doesn't exist. Players have to add `?relay=…` by hand, and the
  invite link drops it.

**Saving today** (`app/save.js`)
- **Where.** In the browser's localStorage, up to 6 characters, each with its own world seed.
- **What survives a reload.** The character (progress, standing, talks, followers and so on) and
  the war's snapshot.
- **What doesn't.** `host.snapshot()` is never written. On reload the wilds, caches, dungeons,
  items on the ground, shop stock and parties start again from the seed.
- **Versions.** `SNAPSHOT_VERSION = 26`, with no migrations: an old snapshot throws.
  `WAR_VERSION = 9` has migrations.

**Time today**
- **What advances it.** Only the host browser's frame loop calls `host.advance`. With no tab
  running, nothing advances, and nothing catches up afterwards.
- **No wall clock.** `core/` reads the wall clock nowhere (no `Date.now`, no `new Date`), so every
  timer runs on the world's own time. That makes freezing a world safe.
- **Sleeping and camping.** These jump only the war's clock, and only for `HOST_PLAYER`.
  `HOST_PLAYER` is special in three places:
  - passing time by sleeping (`host.js:8282`);
  - the debug `fieldBattle` command;
  - chat delivered locally.

**What a headless host costs** (measured, seed 2, Node 22)

| Measure | Result |
|---|---|
| Module import | 1.2 s |
| `buildWorld` | 2.9 s |
| Memory per world | 145–180 MB |
| One player, mean step | 0.45 ms (the step budget is 50 ms) |
| Four players in four towns, mean step | 1.9 ms |
| Worst steps | 0.5–0.9 s: settlement layouts, interiors and navigation tiles made synchronously, which the browser does in workers |
| Snapshot size | 52–345 KB |

**What the rest of the code expects**
- **Glue in the browser.** The host's glue lives in `app/game.js`: the step loop, `hosting.flush()`
  every 0.1 s, `populate()` on the first join, navigation tiles baked ahead around players, and
  saving on each war turn.
- **One wasm heap.** Recast's WebAssembly heap is shared across every world in a process and never
  shrinks.

---

## 2. The shape of it

```
            Mac (macOS 27, Apple Silicon)
 ┌─────────────────────────────────────────────────────────────┐
 │  world server (Node 24 → 26 LTS)                            │
 │                                                             │
 │  supervisor (main thread)                                   │
 │   ├─ one port (8480): TLS from anywhere, plain http/ws      │
 │   │   only from home addresses                              │
 │   │    ├─ HTTP: game client, /api/v1, /admin (home only)    │
 │   │    ├─ WebSocket /play    ── players in server worlds    │
 │   │    └─ WebSocket /broker  ── presence, WebRTC signalling,│
 │   │                             relay fallback              │
 │   ├─ admin listener 127.0.0.1:8481 (the Mac only, no key)   │
 │   ├─ worlds registry, keys, tickets, sessions, identity key │
 │   ├─ storage: settings, saves, backups (versioned)          │
 │   ├─ certificates (ACME), port mapping, reachability test   │
 │   └─ platform layer: Bonjour, keep-awake, folders, secrets  │
 │                                                             │
 │  world worker × N (worker_threads, one per running world)   │
 │   └─ Host + Hosting + the runner (steps, flushes, bakes)    │
 └─────────────────────────────────────────────────────────────┘
        ▲ wss (internet) / ws (Wi-Fi)   ▲ wss/ws (signalling)
        │                               │
   players' browsers  ◄── WebRTC data channel ──►  a player hosting
   (the same client)                               in their browser
```

**The supervisor** owns everything durable:
- the worlds and their settings, keys, players and heroes;
- the network edge (the one port, the two sockets, certificates, Bonjour, port mapping);
- power: keeping the Mac awake while players are in.

It never steps a world.

**The platform layer** (`server/platform/`) holds everything that differs between operating
systems, behind one small interface:
- where data, logs and caches go;
- keeping the machine awake;
- advertising on the network (Bonjour);
- storing secrets;
- running at login.

`darwin.js` comes first. A `linux.js` or `win32.js` later fills in the same functions, and nothing
else in the server changes. Bonjour, for example, becomes Avahi on Linux, and `caffeinate` becomes
`systemd-inhibit` or `SetThreadExecutionState`.

**A world worker** owns one running world. It starts when someone enters a stored world and ends
after the world has been saved with nobody in it.

- **Isolation.** A crash or a 0.9 s stall in one world doesn't touch the others or the management
  page.
- **Memory.** Ending the worker is the only way to free Recast's wasm heap, so stopped worlds give
  back their memory.
- **Messages.** The supervisor and the worker talk over `MessagePort`:
  - the supervisor passes a player's frames to the world and back;
  - the worker hands over snapshots to save;
  - the worker reports its state (players, world time, step times).

**The client** is today's game, served by the server itself as well as by GitHub Pages.

- **Same build, same version.** A player who opens the game from the server always gets a build
  that matches it, which removes most version mismatches. Foundry works the same way: players only
  need a browser link.
- **Same code for joining.** Joining a server world uses today's `Joining`, `predict.js` and
  resync. Only the address and the first line change ([§12](#12-the-protocol)).

**What stays.** Hosting in the browser stays. A player can still open their own world to friends.
That world's link goes through the broker (WebRTC, falling back to relaying), not through relay
rooms that no one hosts ([§8.3](#83-players-running-the-game)).

---

## 3. Running a world without a browser

**3.1 The runner.** Move the host's glue out of `app/game.js` into one module, a `WorldRunner` in
`client/js/core/runner.js`. Both the browser game and the server use it, so they can't drift apart.

- **The step loop.** Fixed 50 ms steps from a monotonic clock, with no 0.1 s clamp per frame. When
  the clock falls behind it catches up by at most 1 s a tick, then lets the rest go and logs it.
- **Flushing.** `hosting.flush()` every 50 ms: each step as it's done (`RUNNER.flushEvery`).
- **The first join.** `populate()`.
- **Baking ahead.** Navigation tiles and settlement layouts are made ahead in a ring around each
  player, so a step never makes them.
  - **On the server:** a pool of two `worker_threads` per world worker. Recast's wasm and the
    layout code already run in Node.
  - **In the browser:** today's Web Workers (`world/navbaker.js`, `world/layouts.js`).
- **Saving hooks.** `onTurn` for each war turn and `onQuiet` when the world goes empty.
- **Telemetry.** Step time (mean, p99, worst) and memory.

**3.2 Worlds without a host player.** On the server no one is `HOST_PLAYER`. The three places that
assume one get a world rule:

| Today | In a server world |
|---|---|
| Only the host passes time by sleeping or camping (`#sleep`). | **Everyone rests.** Time passes only when every player in the world is resting, at an inn or in camp, as Minecraft does by default. The jump is the shortest of the rests chosen. A player resting alone among others just rests, as joiners do today. Browser-hosted worlds keep today's rule (the host passes time). |
| `fieldBattle` is host-only. | Owner-only, and only when the world's "debug commands" setting is on. |
| Chat delivered locally to `HOST_PLAYER`. | Not needed: everyone hears through their socket. |

**3.3 Proving it plays the same.** Joiners in Safari, Chrome and Firefox replay a world stepped by
V8 in Node. The rules use exact maths everywhere (`exact.js`), and a resync catches any drift. But
drift against a Node host has never been measured. The first milestone measures it:

- **The soak.** A Node host with joiners in Chromium, WebKit and Firefox under Playwright, for 30
  minutes, in four towns, with fights.
- **What it counts.** Resyncs per player-hour. The target is under one.
- **What happens with any drift.** It is chased down before anything else is built on top.

---

## 4. A world's life and its time

```
          create / import
                │
                ▼
   ┌──────── stored ◄──────────── saved and set aside ──┐
   │            │ a player enters                       │
   │            ▼                                       │
   │        loading (worker starts, build ~3 s,         │
   │            │      snapshot restored)               │
   │            ▼ the first player has finished loading │
   │        running ── clock running ──┐                │
   │            ▲                      │ last player    │
   │            │ a player has         ▼ leaves         │
   │            │ finished loading   empty ── clock ────┘
   │            └────────────────────  frozen   after the
   │                                            set-aside
   │   locked (no entry)  ◄── owner ──►         delay (2 min)
   └── deleted (typed confirmation)
```

**The clock** is the world's own time: the battle's steps, the war's turns and the 60-minute day.
It moves only in `running`, and `running` means at least one player is present.

- **Who counts as present.** A player whose socket is open and whose client has finished loading.
- **Freezing.** The clock stops in the same step that the last present player leaves, and the
  world is saved at once.
- **When the first player comes back.** The clock starts again only once that player has finished
  loading. That way nobody arrives mid-fight after a 3-second build: Terraria likewise doesn't start
  an empty world until a client has fully connected.
- **Later arrivals.** The world keeps running while other players load in, as today; joiners catch
  up from the ops queue. A world setting, "hold the world while someone joins", freezes it during
  each load. It's off by default, as it is in Factorio.
- **Dropped connections.** A player whose connection drops keeps their place for 30 s, as with
  today's relay grace. If no other player is present, the world freezes during those 30 s, so a hero
  isn't left fighting alone. If they come back within the grace, they carry on where they were.
- **Hidden tabs.** "Pause when everyone's tab is hidden" is a world setting, on by default. If
  every present player's tab is hidden (they switched app or locked their phone), the world freezes,
  as a solo world does today when its tab is hidden. Clients already report visibility (`paused`).
  Server worlds send it to the server.
- **Idle players.** A player who hasn't sent a command for **10 minutes** gets an **AFK** icon
  over their hero's head, beside their name card, seen by everyone. The icon goes as soon as they
  act. After **30 minutes** idle they're disconnected, with "Disconnected for being away", and their
  hero leaves the world as on any exit. Until then they count as present, so the world runs on around
  them. This works the same in browser-hosted worlds, where the host's game runs the timer. The
  rules carry each player's last-command step, so every replica draws the icon at the same moment.
- **Setting the world aside.** After **2 minutes** in `empty` (a server setting), the worker ends
  and the world goes back to `stored`. A stored world costs no CPU and no memory. Entering it again
  starts a worker and restores the snapshot. The clock carries on from exactly where it was.
- **How many run at once.** By default **2 worlds** may be running or loading at once. A third
  entry waits with "The server is busy: 2 worlds are running" until one is set aside. The owner
  changes the number on the management page, which recommends a maximum ([§10](#10-the-servers-management-page)).
- **The management page** shows each world's state in words: for example "Running: 3 players, day
  14, dusk" or "Asleep since 21:40, day 9, morning".

**Proof.** A test enters, leaves and enters again, and checks the war's turn and clock are
identical across the gap. A wall-clock wait in between (simulated) changes nothing.

---

## 5. Saving the whole world

**What's kept**, under `~/Library/Application Support/io.github.hoffspot.pellagos-server/`:

```
VERSION                        the data folder's layout version (see §5.1)
server.json                    the server's settings, with configVersion (written only by the server)
secrets.json         (0600)    admin-key hash, creator-key hashes, the key world keys are
                               sealed with, the salt short codes are hashed with
identity.key         (0600)    the server's identity key pair (§7.6)
certificates/        (0700)    ACME account key, certificates and their keys
worlds/<world-id>/
  world.json                   name, description, seed, home people, created, creator,
                               heroes mode, settings, time played, world time, versions, state
  state/now.json.gz            the latest full snapshot
  state/auto-1..5.json.gz      rotating autosaves
  heroes/<player-id>/<n>.json  kept heroes, up to 6 per player: hero, progress, standing, talks,
                               followers, wheels, explored, place, vitals, pin, messages, told
  access.json                  keys and short codes (hashed), players (ticket hashes, roles,
                               bans, last seen)
  journal.log                  who came and went, keys issued and revoked, admin actions
backups/<world-id>/<stamp>-<why>.pellagos-world   (one gzip'd bundle per backup)
```

The world id is fixed, while its name can be changed, so links and backups survive a rename (as
with Foundry's data path). Logs go to `~/Library/Logs/io.github.hoffspot.pellagos-server/`.
Directories are `0700` and files `0600`. These folders come from the platform layer
([§2](#2-the-shape-of-it)), so on Linux they'd follow the XDG folders and on Windows `%APPDATA%`.

**When it saves**
- On each war turn (every 60 s of world time).
- When the world goes empty.
- When the owner stops or sets aside a world.
- On shutdown.
- Before a restore or a migration.

**How it saves**
- The world worker serialises with `host.snapshot()` (`wire.js` encoding) between steps, which
  takes under 100 ms.
- The supervisor gzips and writes it atomically: a temp file, then `fsync`, then `rename`.
- Every save first moves the latest copy into the autosave ring, so there are always five to roll
  back to.

**Backups**
- **The ladder.** 5 rotating autosaves, then hourly backups (keeping 12) and daily ones (keeping 7),
  counted in wall-clock time while the world runs. A copy is also made before every update, every
  version migration and every restore. This is Palworld's ladder, shortened, and Foundry's
  backup-before-migrate. A large world's backups come to roughly 10–30 MB in all.
- **What the owner can do.** List, restore and download backups, and make one by hand.
- **Corruption.** A corrupt `now.json.gz` falls back to the newest autosave that reads, and the
  journal says so.

**Importing and exporting**
- **Export.** A world's whole folder, as one `.pellagos-world` bundle. It can be imported on another
  server.
- **"Bring my world to the server."** A player's solo world (its seed, home people, war and their
  hero) can be uploaded from the game, or from a file the game saves.
  - That makes a server world with the same seed and war.
  - The player's hero becomes the first kept hero, and the player its owner.
  - The rest of the world starts from the seed, as a reload does today, because the browser never
    kept it.

### 5.1 Settings, versions and upgrades

Upgrades must never lose data, and moving to another platform must need little change. Everything
the server writes carries a version, and every version has a way forward.

| What | Its version | How it moves forward |
|---|---|---|
| The data folder's layout | `VERSION` at its root | A migration per step (files moved or split), run on start before anything else |
| Server settings | `configVersion` in `server.json` | Migrations fill in new settings with defaults and rename old ones. Every setting has a schema; unknown keys are kept, not dropped, so a newer server's settings survive a trip through an older one. |
| A world's metadata | `formatVersion` in `world.json` | Migrations per step |
| A world's snapshot | `SNAPSHOT_VERSION` (27 today) | **New rule:** every bump ships a migration from the previous version, as `WAR_VERSION` already does. `test/` keeps a fixture snapshot for each version and loads it through the whole chain. contribution.md's version rules gain this line. |
| The war | `WAR_VERSION` (9 today) | Its existing migrations |
| Kept heroes | `SAVE_VERSION`, shared with the browser's saves | Read through the same code the browser uses (`Progress.fromJSON` and the like), which already accepts older shapes. Anything new gets a migration in `core/`, used by both. |
| The protocol | `NET_VERSION` and the sockets' subprotocols | No migration. A server serves its own matching game, and a mismatched client is told to update or open the game from the server ([§12](#12-the-protocol)). |
| The server itself | semver (`2.x.y`) | Shown on the page and in status; the update check compares it |

**Rules that keep data safe**
- **Backup first.** Before any migration, the server backs up what it is about to change.
- **Never silently.** The management page lists what will be migrated and asks before an update
  installs.
- **Forward only, and never by an older server.** A server refuses to open a data folder, settings
  file or world written by a newer version. It says which version is needed rather than guessing,
  so a rollback can't corrupt anything. Rolling back means restoring the backup made before the
  upgrade, which the page offers.
- **Atomic writes everywhere.** A temp file, then `fsync`, then `rename`, for settings as well as
  saves.
- **Settings changes are validated** against the schema before they're written. A bad value is
  refused with the reason.

**The safety net for worlds.** If a snapshot migration is missing or fails, the server offers a
"fresh start from the seed". It keeps the war, the kept heroes and the world's time, and rebuilds the
rest, which is exactly what a reload does today. It never does this silently: it makes a backup
first and asks the owner.

**Updating** follows these rules, with the steps in [§11](#11-on-the-mac): the owner clicks, nothing
updates while players are in, everything is backed up first, and a failed update goes back to the
old version and its backups.

---

## 6. Heroes: kept by the world or brought in

The world's creator picks the mode when making the world.

| | **Kept by the world** | **Brought in** |
|---|---|---|
| Where the hero lives | On the server, in `heroes/<player-id>/`, **up to 6 heroes per player in each world** (as the game keeps 6 on a device) | On the player's device (localStorage), as today |
| First time in | Depends on the world's "first hero" setting, chosen by its owner: **new heroes only** (made in the game's character maker), or **may bring one in on the first visit**, after which it belongs to the world. Further heroes, up to 6, are always made new. | Pick one of your saved heroes |
| Coming back | The return ticket ([§7](#7-keys-identity-and-the-access-hooks)) lists the player's heroes in that world. They pick one, and it comes back where they left it, with its pack, gold and wounds. | Bring any hero again |
| On leaving | `host.leave` returns the character, and the server saves it | The client saves from its replica's events, as today. The server keeps only a last-seen line. |
| Can it be edited on a device? | No. The server is the only copy. | Yes. `characterFrom` still cleans it up, but gold and pack are trusted. |
| Listing badge | "Heroes stay here" | "Bring your hero" |

**Kept mode closes a hole.** Today a joiner's gold and pack are taken as sent, which lets an edited
save into anyone's world. Valheim's players fix the same hole with server-side character mods; Factorio,
Satisfactory, V Rising and Foundry all keep characters server-side.

**Brought-in worlds take limits through the access hooks** ([§7.5](#75-the-access-hooks)): for
example, refusing heroes above a level or carrying more than some amount of gold.

**Moving a kept hero to another device** uses the return ticket, which can be shown as a code or a
QR code.

**Switching a world's mode.** The owner can switch, after a warning, and a backup is made first.
- **Kept → brought in:** the next time each player enters, the server hands them their kept heroes
  to save on their device. The game asks which to keep if they'd go over its 6 slots. From then on
  heroes come from devices.
- **Brought in → kept:** the heroes in the world at the switch become kept heroes. Players who come
  later bring one in on their next visit, whatever the "first hero" setting says, and from then on
  the world keeps it.

Browser-hosted worlds, where a player opens their own world to friends, stay "brought in", as
today.

---

## 7. Keys, identity and the access hooks

### 7.1 What there is

| Thing | Who holds it | What it does | Form |
|---|---|---|---|
| **World id** | Anyone. It's public. | Names a world in listings and links. Fixed for the world's life. | 10 Crockford characters (about 50 bits) |
| **Admin key** | The Mac's owner | Manages the server from any device other than the Mac itself, and creates worlds. Made at first start and shown on the management page on the Mac. | A long key, as below |
| **Creator key** (optional) | People the owner lets make worlds | Makes worlds from the game. The maker becomes that world's owner. | A long key |
| **World key** | Anyone the world's owner shares it with | Gets into one world, with the key's role: owner, trusted or player | A long key |
| **Short code** | Someone being told a code aloud, at a table or over voice chat | Made by the owner, or by trusted players if the world allows. Exchanged once for the world key and a ticket. Lasts 15–60 minutes and N uses, and can be revoked. | 8 Crockford characters (40 bits) |
| **Return ticket** | Each player, per world | Says "this is me again": brings back a kept hero, a role and bans | 128 random bits, base64url |
| **Session** | The game, while connected | Reconnects without asking again; ends when its key is revoked or replaced, and has idle and absolute time limits | 128 random bits, short-lived |

**A long key's form.** 30 Crockford base-32 characters in six groups, for example
`KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA`.

- **The first four characters** name the key, so the server can look it up.
- **The other 26 characters (130 bits)** are the secret. That meets OWASP's 128-bit minimum for
  generated secrets.
- **Storage.** High-entropy keys, tickets and sessions are stored as SHA-256 and compared in constant
  time (`timingSafeEqual`). Slow hashing only matters for guessable secrets, so short codes get
  scrypt (N=2¹⁷, r=8, p=1, OWASP's minimum: about 0.4 s a guess) as well as their short life. The
  salt is the server's own, so a guess is one hash, looked up, not one for every live code.
- **Shown again.** A world's keys are also sealed (AES-256-GCM, with a key in `secrets.json`), so
  the owner can be shown one again as a link or QR code. The admin and creator keys are shown once.
- **Sessions** are kept in memory only. After a restart the game enters again with its key and
  ticket.
- **Typing.** Keys are mainly shared as links and QR codes, but typing is forgiving: case doesn't
  matter, dashes are optional, and O reads as 0 and I or L as 1.

**Invite links** carry the key in the fragment, which browsers never send to a server, so it can't
land in a log:

```
http://studio-mac.local:8480/#join=K7Q2MXD4RT.KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA
https://pellagos-sam.duckdns.org:8480/#join=…                (internet, with TLS)
https://hoffspot.github.io/conquest/#server=…&join=…          (from GitHub Pages; §9.5)
```

**Where the game would rather prove than present.** Where the game runs in a secure context (on the
Mac itself, at a TLS address, or from GitHub Pages), it also makes a non-extractable Ed25519 key
pair with WebCrypto (in every major browser since 2025) and registers its public key with the
ticket. Coming back then signs the server's nonce instead of sending a reusable secret. On
plain-`http` pages on the Wi-Fi, which have no WebCrypto, the ticket alone does.

### 7.2 How a key is used

1. A player enters a world: `POST /api/v1/enter {world, key, ticket?}`, or the same first line on
   the socket.
2. The server checks the key's hash, role, expiry, use count and whether it has been revoked. It
   also checks the player's ticket, if they have one, against bans.
3. **First visit:** the server issues a return ticket. The game keeps it with the server's address
   in `pellagos.servers`.
4. **Later visits:** the same key and ticket bring the same player back, with the same hero (in
   kept mode) and the same role. The ticket alone does too, while the key they last came by still
   works.
5. **The key keeps working** until the world's owner revokes it, replaces it, or it reaches an
   expiry or use count they set. The use count limits new players only: those it let in come back.
   Replacing a key ends every session that entered with it, as changing a password does in
   Satisfactory. Its players then need a key that works, and their ticket keeps them the same
   player, with the same heroes.

**Many keys per world** follow Enshrouded's user groups and Realms' invite links:

- each key has a label ("Tuesday group"), a role, an optional expiry and an optional use count;
- a world holds at most 10 live keys;
- the management page and the in-game World panel list them, show each as a QR code, and revoke or
  replace them.

### 7.3 The owner and claiming the server

- **First start.** The server makes the admin key and shows it only on the Mac: on the management
  page opened at `localhost`, and in the Terminal output. This works like Satisfactory's claim and
  Foundry's administrator access key.
- **On the Mac itself**, the management page needs no key. It has its own listener,
  `127.0.0.1:8481`, that nothing else reaches. Being at the Mac is the proof.
  - **Why a second port.** Tunnels such as Tailscale Funnel deliver internet traffic to the play
    port *from* `localhost`. So "came from localhost" can never mean "is the owner" on the play port.
  - **Guards.** The admin listener is also protected against DNS rebinding and cross-site requests
    ([§13](#13-security)).
- **From the home network**, the page is at `/admin` on the play port and needs the admin key. It
  answers only requests from home addresses (private IPv4, IPv6 unique-local and link-local) that
  reached the server directly, never through a tunnel.
- **From the internet, never,** whatever key is offered. Making worlds with a creator key, and
  managing one's own world as its owner, go through the game's own screens and `/api/v1`, which
  are open to the internet over TLS. The server-wide page isn't.
- **Forgotten admin key.** The owner makes a new one from the page on the Mac. Physical access is
  the recovery, as deleting the settings file is in Satisfactory.

### 7.4 Roles

| Role | Can |
|---|---|
| **owner** (of a world) | Everything for that world: settings, keys, players, backups, export, delete, start and stop. Owner-only commands. |
| **trusted** | Play. Issue player keys and short codes, if the world's "trusted may invite" setting is on. |
| **player** | Play |
| **banned** | Nothing. A ban follows the player's return ticket for good, and the internet address they last came from for 24 hours, to slow a comeback with a fresh key. The owner can lift either. |
| **creator** (of the server) | Make worlds, and so own them. Holders of a creator key. |
| **admin** (of the server) | Everything on the server, including every world, and creator keys |

### 7.5 The access hooks

Every check goes through one interface, `server/access/policy.js`:

```js
/** Who is asking, from a request or a socket's first line. */
identify(request) → { principal, proofs }          // keys, ticket, session, (later) passkey
/** May they do this? */
allows(principal, action, target) → { yes, role, why }
/** Told of what happened, to log, limit or veto. */
on(event, detail)                                  // entered, left, keyIssued, keyRevoked, refused…
/** May this hero come in? (brought-in worlds) */
admits(principal, world, character) → { yes, why, character }
```

- **Actions** have fixed names: `server.manage`, `world.create`, `world.enter`, `world.manage`,
  `world.delete`, `key.issue`, `key.revoke`, `player.kick`, `player.ban`, `broker.announce`,
  `broker.connect`.
- **The built-in policy** is keys plus tickets.
- **Later policies** plug in by configuration, without changing worlds:
  - passkeys (WebAuthn, on HTTPS origins only);
  - OpenID Connect (Sign in with Apple, Google, Discord);
  - an allowlist of tickets;
  - a "LAN only" rule.
- **Return tickets become accounts.** A new sign-in method binds to the same player record, so
  heroes carry over.

**Limits.**
- **Short codes.** Wrong guesses are counted across the server, not per address, because many
  homes behind one CGNAT address share an IP (and a wrong guess names no code or world). They back
  off exponentially from 1 s, doubling to 5 minutes, with the same answer and timing whatever was
  wrong. After 20 failures in an hour (about as fast as the backoff allows) every short code is
  burned and the page shows it.
- **Long keys.** 130 bits can't be guessed, so they're limited only by the general per-address caps
  ([§13](#13-security)).
- **Logs.** Keys, codes and tickets never appear in logs. The journal records the key's name only.

### 7.6 The server's identity

A typed IP address can change hands: the home's provider may give it to someone else tomorrow. So
the game never sends a key or ticket to an address until the server has proved it is the one the
player meant, as SSH does with host keys and Syncthing with device ids.

- **The key pair.** Each server makes an Ed25519 key pair on first start (`identity.key`). Its id is
  a fingerprint of the public key, shown on the management page and carried in invite links.
- **The proof.** The game's first message carries a random nonce. The server's answer carries its
  public key and signs `pellagos.hi.1` and the nonce with it. The game checks that the key's
  fingerprint is the id it pinned, and the signature.
  - **In secure contexts** the game checks the signature with WebCrypto.
  - **On plain-`http` pages**, which have no WebCrypto, it uses a small vendored verifier
    (`noble-ed25519`, MIT, about 5 KB).
- **Pinned on first use.** The first time, the game pins the id, or takes it from the invite link,
  which is better. From then on:
  - a different id at a remembered address stops everything, with "This isn't the server you
    played on before";
  - no key or ticket is sent;
  - the player can re-pin only by following a fresh invite link.
- **On top of TLS.** A certificate proves the name or IP; the identity proves the *server*.
  Together they cover an IP that has moved to someone else with their own valid certificate.

---

## 8. Finding worlds

The game's **Worlds** screen merges three sources.

### 8.1 Servers the player knows

- **Typing an address.** "Add a server" takes a DNS name, an IPv4 address or an IPv6 literal, plus
  a port (default 8480). For example `studio-mac.local:8480`, `192.168.1.20:8480`,
  `[fd00::20]:8480` or `pellagos.example.duckdns.org:8480`.
- **Remembering.** The game remembers each server with its name, its keys and tickets, and when it
  was last seen. They are kept in localStorage under `pellagos.servers`, and can be exported and
  imported as a code ([§9.5](#95-from-the-github-pages-copy) explains why).
- **Status: what anyone may see.** Each known server is checked with `GET /api/v1/status`, which
  needs no key and is rate-limited. As in Minecraft's server list, it returns:
  - **the server's card:** its name, id, version, `NET_VERSION`, the snapshot version and the build;
  - **its listed worlds:** name, description, home people, state, heroes mode, whether a key is
    needed, the world's age and time played, the players in now out of the most allowed, and their
    hero names;
  - nearby servers;
  - listed players' worlds;
  - the round-trip time.
- **Unlisted worlds,** the default for new worlds, appear only to players who hold a key or ticket
  for them, in an authenticated `GET /api/v1/worlds`. The owner lists a world from its settings.
- **Version mismatch.** A server whose `NET_VERSION` differs is greyed out. It offers "Open the game
  from this server", which always matches.

### 8.2 Nearby Macs

- **Advertising.** The server advertises `_pellagos._tcp` with Bonjour. Its TXT record carries the
  server's name, version, `NET_VERSION`, the API port and the number of listed worlds.
- **Browsing.** It also browses for other Pellagos servers on the network and lists them under
  `nearby` in its status.
- **Why the server does it.** Browsers can't browse Bonjour, so any player who reaches any server
  on the Wi-Fi sees the rest.
- **On the Mac itself**, the game asks `localhost`.
- **Its name** is the computer's own (macOS's ComputerName, "Studio Mac"), else its host name. The
  responder may change it to make it unique on the network ("Studio Mac (2)").
- **The TXT record's values** are percent-encoded, letters, digits and `. _ - %` alone, so no tool's
  escaping can change them: `txtvers`, `id`, `name`, `version`, `net`, `port`, `worlds`.
- **Added from the game.** A player who reaches one server sees the others it found, "Nearby", and
  adds one with a tap: by its `.local` name when their page was reached by one, else by its IPv4
  address. The id it advertised is expected, so the server must prove it before anything secret is
  sent ([§7.6](#76-the-servers-identity)).
- **Their pages.** Each server's page is its own origin, with its own storage, so a player's
  characters and known servers live where they first opened the game. A server therefore lets the
  game from a nearby server's page use its play routes, by that server's exact addresses
  ([§13](#13-security)). It's no wider: those routes carry their keys themselves, never cookies.
- **No permission needed for play.** Bonjour needs macOS's Local Network permission, while serving
  players doesn't. So Bonjour is a setting ("Show this Mac to others on the Wi-Fi", on by default).
  If macOS refuses it, play carries on, and the page shows the address to type instead, with a QR
  code ([§11](#11-on-the-mac)).
- **"On your network" without Bonjour.** The broker marks players and servers that reach it from the
  same public address as "probably on your network", as Philips Hue's bridge discovery does. That
  is only a hint: under CGNAT, strangers share an address too. So it never grants anything.

### 8.3 Players running the game

A player who opens their own world in the browser can list it on the servers they use, chosen per
server: "List my world on: ☑ Studio Mac ☐ Sam's server".

- **Announcing.** Their game connects to each chosen server's `/broker` and announces: name, home
  people, players in now and the most allowed, `NET_VERSION`, and visibility (listed, or code
  only). It keeps the announcement alive every 15 s. It lasts while the host's link to the broker
  is open (the broker's own pings say so, however seldom a page in the background keeps it), and
  disappears 45 s after that link closes, unless the host comes back on a new one.
- **Joining.** A joiner picks it from the server's list. The broker passes the WebRTC offer,
  answer and ICE candidates between them, and the two browsers open a data channel.
  - **The channel.** Today's netplay messages, unchanged, over a reliable, ordered data channel.
  - **The host's side.** `Hosting` already sends to each peer by name, so the host runs one data
    channel per joiner.
- **Reachability first.** Before listing, the hosting game gathers ICE candidates once, to see
  whether it can be reached directly. A world that can't is shown as "through the server" if the
  server allows relaying, and not shown otherwise.
- **Relaying when direct fails.** If WebRTC doesn't connect within 10 s, the broker relays the same
  frames over its WebSocket. This is today's relay protocol, now run by someone. It costs the
  server about 2 KB/s per joiner.
- **Where the code changes.** `RelayLink` becomes one of two `Link`s: a relayed one and a peer one.
  `Hosting` and `Joining` don't change.

[§9.6](#96-webrtc-between-browsers) covers STUN, the iPhone's quirks and how often direct
connections succeed.

---

## 9. Reaching the server

**The model** (the user's): the server opens one port to the internet. Any player types a DNS name
or an IP address plus that port, or follows an invite link, and their game reaches the server
directly, across the internet or across the Wi-Fi.

What browsers allow in 2026 decides how to make that safe. The research notes cite each of these:

- **Safari blocks plain `ws://` from an HTTPS page.** On the Mac and iPhone, an HTTPS page such as
  GitHub Pages can't open `ws://` to `localhost` or a home address (WebKit bug 171934, open since
  2017).
- **Chrome and Firefox allow it, with a prompt.** Chrome 147 and later allow `ws://` to a private
  IP or a `.local` name from an HTTPS page, after a "local network" permission prompt. Firefox is
  rolling out the same prompt from 151.
- **Pages the Mac serves itself work everywhere.** A page served by the Mac
  (`http://studio-mac.local:8480`) talking to the same Mac triggers no prompt and no mixed-content
  block in any browser. Chrome 154's "HTTPS by default" warning leaves private addresses alone.
- **The cost of those pages.** They aren't secure contexts: no WebCrypto, service worker, passkeys
  or async clipboard. The game already copes: `fetcher.js` checks for `crypto.subtle`, the service
  worker registers only in secure contexts, and copying falls back.
- **From the internet, a certificate every browser trusts.** Self-signed certificates won't do on
  an iPhone without installing a profile. Free ones are available by name or by IP
  ([§9.2](#92-free-certificates)).

### 9.1 One port, two kinds of connection

The server listens on port **8480** (changeable) on every IPv4 and IPv6 address. It looks at the
first byte of each connection: a TLS handshake (`0x16`) is handled as HTTPS/WSS, anything else as
plain HTTP/WS (`server/world-server.js`: the byte's put back, so the half it's handed to reads it
whole). Both halves answer the same, each with its own time limits: a connection that says nothing
for 5 s, or stops partway through its headers or a TLS handshake, is let go. The internet is
answered only when the owner turns on **Answer the internet** (the `internet` setting) and the
server has a certificate; until then it's refused (`internet`, 403, saying which is missing).

| From | Plain `http`/`ws` | TLS `https`/`wss` |
|---|---|---|
| **A home address:** private IPv4 (`10/8`, `172.16/12`, `192.168/16`), link-local, IPv6 unique-local (`fc00::/7`) or link-local | Accepted | Accepted |
| **The internet:** every other address, including the CGNAT range `100.64/10` | **Refused.** A page load is redirected to `https://`. A socket is closed with "Use the server's secure address". | Accepted, if a certificate is set up. Without one the server doesn't answer the internet at all, and the page says opening to the internet isn't finished. |

**Two more listeners on loopback only**, never reachable from outside:
- `127.0.0.1:8481` for the management page on the Mac ([§7.3](#73-the-owner-and-claiming-the-server));
- `127.0.0.1:8482` for a tunnel ([§9.4](#94-behind-cgnat)), while Tailscale Funnel's on (its
  `tunnelPort` setting). Everything arriving there is treated as internet traffic, because a tunnel
  delivers it from `localhost`: where it's from is X-Forwarded-For's last address (the tunnel's own
  proxy adds it), and it's taken plain, the TLS having been the tunnel's.

**What a player types, and what happens:**

| Typed | Game opened from | What happens |
|---|---|---|
| `pellagos-sam.duckdns.org:8480` | anywhere | `wss://`, with the name's certificate. Works in every browser, anywhere. |
| `203.0.113.7:8480` or `[2001:db8::7]:8480` | anywhere | `wss://`, with an IP certificate ([§9.2](#92-free-certificates)) |
| `studio-mac.local:8480` or `192.168.1.20:8480` | the server's own page | `ws://`, no prompt |
| the same | GitHub Pages | Chrome and Firefox: `ws://` after their prompt. Safari: a hand-off to the server's own page ([§9.5](#95-from-the-github-pages-copy)). |

**Home and away under one name.** The server's status lists all its addresses, and says whether
the one asking seems to be at the server's home (`you.home`: from a home address, or from the
home's own public address the long way round). The game remembers them with the server's id
([§7.6](#76-the-servers-identity)) and tries, in turn (`app/servers.js` `candidatesOf`): the one
that last answered; then, if it was last at home, the home addresses, else the one it was added by
and the internet ones; plain ones last from a secure page. Each but the last gets 4 s; a card that's
another server's is passed over. So a laptop that moves between home and a café keeps working. It
also gets round routers that can't loop a public name back inside (no "hairpin NAT").

### 9.2 Free certificates

The server carries an ACME client (RFC 8555, on `node:crypto`, no native add-ons). It keeps the
account key and certificates in `certificates/` (`0600`) and renews them itself. Setup offers three
routes, in this order:

| Route | Players type | How it's proved | Renewal | Trade-offs |
|---|---|---|---|---|
| **1. A free DuckDNS name** (suggested first) | `pellagos-sam.duckdns.org:8480` | DNS-01: the server sets `_acme-challenge` through DuckDNS's `&txt=` API. Works on any port. | When Let's Encrypt's renewal information says (RFC 9773), else with a third of its life left (30 days of 90). Let's Encrypt lifetimes are shrinking from 90 to 45 days over the next few years, and the client follows. | Needs a free DuckDNS account and token. The server also keeps the name pointed at the home's address, checking every 5 minutes, so links survive IP changes. `duckdns.org` is on the Public Suffix List (its private section), so each DuckDNS name counts as its own registered domain for Let's Encrypt's limits: DuckDNS users don't share one weekly limit. |
| **2. The owner's own domain** | `pellagos.example.com:8480` | DNS-01 through the domain's DNS host's API (a token the owner pastes in) | As route 1 | For owners who already have a domain. Nothing is bought for this. |
| **3. The IP address** | `203.0.113.7:8480` or `[2001:db8::7]:8480` | TLS-ALPN-01 on port 443 (or HTTP-01 on 80). The router maps external 443 to 8480, and the server answers the `acme-tls/1` challenge on its own port. | The "shortlived" profile (160 hours), renewed when the renewal information says (about halfway), else with a third of its life left | No account at all. But the certificate, and every shared link, breaks when the home's IP changes. The server re-issues automatically for the new IP, and the page warns that links must be re-shared. |

**Not offered:**
- plain `ws://` from the internet;
- self-signed certificates, which browsers warn about and iPhones refuse without a profile;
- Cloudflare quick tunnels, ngrok and playit.gg: random names, warning pages or paid HTTPS.

**Later: WebTransport** with `serverCertificateHashes` (Baseline 2026, Safari 26.4) would let a page
reach a self-signed server by its certificate's hash. It needs an HTTP/3 server, which Node doesn't
yet offer in a stable form. Revisit when it does.

### 9.3 Opening the router

- **Asking the router.** While the server answers the internet (**Answer the internet**) and may
  ask (**Ask the router**, on at first), it asks the router (the default gateway: `route` on
  macOS, the kernel's routing tables on Linux) for a mapping. It tries, in order:
  - PCP (RFC 6887: a mapping renewed by the nonce it was made with);
  - NAT-PMP (RFC 6886: UDP 5351, a 2-hour lifetime renewed at half-life; it's in Apple's own
    routers);
  - UPnP-IGD (found by SSDP, believed only at a home address; a router that takes only mappings
    that don't run out is asked for one).

  It maps TCP 8480 the same outside, plus 443 for an IP certificate. PCP and NAT-PMP forward one
  outside port to each inside one, so 443 goes to a second listener the server opens on any free
  port, which takes the same connections as 8480.
- **IPv6.** Addresses need no mapping, but home routers firewall inbound IPv6. The server asks for
  a pinhole through PCP or UPnP-IGD v2's IPv6 firewall control where the router offers it.
- **While running.** Mappings are renewed, and removed when the owner turns internet access off or
  the server stops. A router that won't is asked again after a minute, then 5, then 30. **Close
  to the internet** is one switch on the page: the mapping goes, and internet connections are
  refused from that moment.
- **macOS permission.** Talking to the router counts as reaching the local network. A Terminal
  launch is exempt; the Phase 2 app needs macOS's Local Network permission ([§11](#11-on-the-mac)).
- **When the router won't.** The page shows manual steps: the router's admin address (the
  gateway), the Mac's LAN address, and the ports to forward.
- **Proving it works.**
  - **Public address.** From the router's answer, and a STUN request to `stun.cloudflare.com` or
    `stun.l.google.com`. These are free, with no service promise.
  - **CGNAT.** Spotted when the router's external address falls in `100.64.0.0/10` or differs from
    the STUN answer ([§9.4](#94-behind-cgnat)).
  - **Hairpin check.** The server tries its own public address through the router (a connection
    that starts `PELLAGOS-HAIRPIN` and a one-time token, which its own port recognizes). Success
    proves the port is open; failure proves nothing, as many routers don't hairpin. It isn't tried
    behind a provider's NAT.
  - **Free extra proof.** A Let's Encrypt IP certificate can only be issued if the port is reachable.
  - **From outside.** The definitive test is the game's **"Test this server"** button on any device
    on another network (a phone on cellular), which reports back to the server's page
    (`POST /reachability`: what it tried at which of the server's own addresses, kept for the page,
    the last 5; a report from the server's own Wi-Fi is said to prove nothing of the internet).

### 9.4 Behind CGNAT

When the internet provider shares one public address between many homes, no router setting can
open a port. The page says so plainly: "Your internet provider shares one address between many
homes, so nobody can reach this Mac directly from the internet." It then offers two ways on:

1. **Tailscale Funnel**, free.
   - **Setup.** The owner installs Tailscale (on macOS, the app or Homebrew's open-source client)
     and signs in, then turns on **Tailscale Funnel** on the page (the `funnel` setting). While the
     server's open to the internet it runs `tailscale funnel --bg --https=443 --yes
     http://127.0.0.1:8482` (`server/funnel.js`; the command found where each system keeps it,
     `server/platform`), after checking with `tailscale status --json` that it's running and
     signed in, and with `tailscale serve status --json` that nothing else is served there: the
     owner's own use of Funnel is never taken over. A tailnet that hasn't allowed Funnel yet makes
     Tailscale print where to allow it; the page shows that link, and **Ask Tailscale again**. It's
     looked at again every 10 minutes, retried after 1, 5 and 30 minutes, and let go (`tailscale
     funnel --https=443 off`, if it's still the server's) when the server's closed to the internet
     or stops.
   - **The address.** Players reach `https://studio-mac.<tailnet>.ts.net`, a stable name with
     Tailscale's own certificate, on port 443, 8443 or 10000.
   - **How it's treated.** Traffic arrives on the tunnel listener, `127.0.0.1:8482`, which the server
     treats exactly as internet traffic: keys required, no management. It needs no certificate of
     the server's own (Tailscale's is used), so the internet's answered through Funnel as soon as
     the server's open to it; whoever came that way is sent out when it's closed.
   - **Bandwidth.** Funnel's cap is unpublished; play needs about 2 KB/s per player.
2. **Players' browser worlds.** Friends elsewhere can still play together in a world hosted in one
   of their browsers, through a broker that all of them can reach ([§8.3](#83-players-running-the-game)).
   This Mac stays a Wi-Fi-only server.

**Not assumed: a shared public relay.** The networking research's own first pick was a public relay
that every Mac dials out to, as Home Assistant's cloud and Syncthing's relays work. That needs
hosting, which is paid and was ruled out. If the owner ever finds free hosting they're happy with,
the broker protocol of [§12.3](#123-websocket-broker-subprotocol-pellagosbroker1) can serve as that
relay, with a Mac announcing its worlds there as a browser host does.

### 9.5 From the GitHub Pages copy

**Where the game comes from decides what it can reach:**

| The game was opened from | It can reach |
|---|---|
| The server itself (`http://…:8480` on the Wi-Fi, or its `https://` address) | That server always. Any server with a certificate. Browser-hosted worlds through that server's broker. |
| GitHub Pages (`https://hoffspot.github.io/conquest/`) | Any server with a certificate, by name or IP. A server on the Wi-Fi by `ws://` in Chrome or Firefox after their prompt (private IP or `.local` only), **never in Safari**. |

**When a typed address can't be reached from this page,** the game says why and offers the way that
works. For example: "Safari can't open an unencrypted connection to your home network from this
page. Open the game from the server instead: http://studio-mac.local:8480". Following that link
carries the world, the key and any ticket in the fragment.

**Every origin has its own storage.** `https://hoffspot.github.io` and
`http://studio-mac.local:8480` don't share localStorage. So:
- invite links carry what's needed in the fragment;
- **"My servers and tickets"** can be exported and imported as a code or QR code. That also survives
  Safari wiping a site's storage after 7 days without a visit;
- a world's owner can **reissue** a lost player's ticket from the Players section, and their heroes
  come back.

**Typed addresses.** The game accepts `host`, `host:port`, `ws(s)://…`, `[v6]:port` and invite
links. One typed bare is tried `wss://` first, then `ws://` where the browser and address allow it
(a home address from a page that isn't secure is tried plain first), then the server's own page is
offered: a link to it carrying the server and its id, and from a world's card the world and its key
or ticket too. It sends nothing secret until the server has proved its identity
([§7.6](#76-the-servers-identity)).

### 9.6 WebRTC between browsers

- **How often direct works.** About 10–25% of WebRTC connections need relaying. That figure comes
  from secondary estimates; Tailscale reports over 90% direct with basic STUN.
- **The order of attempts:**
  1. Direct, on the LAN through the browsers' mDNS host candidates.
  2. Through STUN: the server's own STUN responder, a few lines on `node:dgram` when the Mac is
     reachable, or the free public ones.
  3. The broker relaying over its WebSocket.
- **TURN.** coturn 4.18 from Homebrew, with short-lived `use-auth-secret` credentials, is an option
  for owners whose Mac has open UDP ports. It isn't part of the plan's default.
- **The channel.** One reliable, ordered data channel carries today's netplay messages, since the op
  stream needs order.
  - **Big messages.** Data channels assume 64 KB messages unless both ends agree more. So `welcome`
    and `state`, which can be 350 KB, are cut into 16 KB pieces and joined again.
  - **Back-pressure.** Sending waits on `bufferedAmountLowThreshold`.
  - **Later.** The motion stream could move to an unordered, unreliable channel.
- **When the network changes** (Wi-Fi to cellular), the game calls `restartIce()` through the
  broker. If that fails within 5 s it falls back to relaying.
- **iPhone hosts.** iOS stops networking for a backgrounded Safari tab. A world hosted on an iPhone
  is marked "temporary" in the listing and dropped quickly when its announcements stop.
- **Unknown: Chrome's local-network prompt and WebRTC.** Whether Chrome's prompt also covers
  WebRTC's local candidates is contradicted in Chrome's own sources. S6 tests it.

---

## 10. The server's management page

**Where it opens:**
- **On the Mac:** `http://localhost:8481/`, the admin listener bound to `127.0.0.1`. No key.
- **From the home network:** `/admin` on the play port, for example from a phone on the Wi-Fi. Needs
  the admin key.
- **From the internet:** never, whatever key is offered ([§7.3](#73-the-owner-and-claiming-the-server)).

It uses the same `/api/v1` the game uses, and the same look as the game's menus, built from the
game's CSS colours.

| Section | What it shows and does |
|---|---|
| **Overview** | **Addresses:** the server's name and every address, each with a QR code: `localhost`, `name.local`, the LAN IP, the internet name or IP, and any Tailscale Funnel name. **Internet:** whether it's open to the internet, with its certificate, its renewal date and the last reachability test. **About:** version and uptime, and whether a new version is out. **Power:** whether the Mac is being kept awake, with a warning on battery or with the lid likely to close. |
| **Worlds** | A card per world, sorted by most recently played. **Shows:** name, home people, seed, created, time played, world day and hour, state in words, players in now (with AFK marks), heroes mode, listed or unlisted, size on disk. **Buttons:** Play (opens the game into this world), Start, Set aside, Keys, Players, Backups, Settings, Export, Delete. Delete needs the world's name typed, as Foundry does. |
| **New world** | **Basics:** name, description, seed (random, or typed), home people, most players (up to 8), listed or unlisted (**unlisted** by default). **Heroes:** kept or brought in; for kept worlds, "first hero" new only or may be brought in once. **Rules:** pause when every tab is hidden (on), hold the world while someone joins (off), AFK icon after 10 minutes and kick after 30, trusted players may invite (off), debug commands (off). Resting always needs everyone present. **Then:** issues the first owner key and a player key. |
| **Keys** | Per world: label, role, created, last used, uses, expiry. Issue, show (as text, link and QR), revoke, replace. Short codes: make one (15–60 minutes, N uses), see its uses, revoke. |
| **Players** | Per world, who's in now and everyone who has been. **For each:** name, heroes, role, first and last seen, time in the world, AFK. **Buttons:** kick, ban (ticket for good, address for 24 hours), unban, change role, reissue ticket. |
| **Backups** | Per world: the autosaves and the ladder (5 autosaves, 12 hourly, 7 daily, plus before every update, migration and restore), with when, why and size. Restore (a backup is made first), download, make one now. |
| **Server settings** | **Network:** port (8480), Open to the internet, certificate route (DuckDNS name, own domain, or IP), router mapping, Tailscale Funnel, Bonjour, broker, relaying for browser worlds. **World making:** creator keys (issue, revoke). **Running:** worlds at once (default 2, with the recommended maximum beside it), set-aside delay (2 minutes), keep the Mac awake while players are in (on), data folder. **Updates:** check daily (on), update. |
| **Activity** | The journal: entries, exits, AFK kicks, keys, refusals, admin actions, certificate renewals, saves and their times. |
| **Health** | Per running world: step time (mean and p99), the worst step and what made it, memory, snapshot size, players, bandwidth. The server's CPU and memory. Like Satisfactory's `HealthCheck`, a world is "slow" when its steps fall behind. |

**The recommended maximum of worlds at once** is worked out from what this machine has and what its
worlds really use:

- **Memory.** Usable memory is the machine's total less a reserve for macOS and the owner's own
  apps: the larger of 4 GB and a quarter of the total. Divide that by the largest memory a world has
  used here, or 250 MB until one has run.
- **CPU.** One world per performance core, less one core for the server and the owner. The count
  comes from `os.availableParallelism()`; on Apple Silicon, `sysctl hw.perflevel0.physicalcpu` gives
  performance cores through the platform layer.
- **Shown.** The smaller of the two, with its reasons. For example: "Recommended: up to 6 (memory
  allows 22, CPU allows 6)".
- **Above the recommendation.** The owner may set more. The page then warns, and the Health section
  shows when steps fall behind.

**Stopping the server** from the page or with Ctrl+C saves every world first. Valheim's "closing
the window may leave it running" is a known trap. The page says when it's safe to quit.

---

## 11. On the Mac

What macOS 27 changes, and what we do about it. These come from the macOS research notes, which
cite Apple's TN3179 and the macOS 27 release notes.

| Fact | Consequence |
|---|---|
| macOS 27 runs only on Apple Silicon. Rosetta isn't restored on upgrade, and Intel code stops running in macOS 28. | Ship arm64 Node and nothing x86. |
| Accepting incoming TCP connections needs **no** Local Network permission. Bonjour, connecting to LAN hosts, sending UDP, and connecting to the router for port mapping all **do**. | **Play needs no permission:** HTTP and WebSocket on one port. Bonjour, port mapping and the STUN reply are extras that can fail cleanly. |
| Programs run from Terminal (and their children) and launchd daemons are exempt. LaunchAgents and apps are not. The permission follows the code signature, and Node's BSD sockets have been seen failing with `EHOSTUNREACH` and no prompt. A supported reset arrives in 27.2. | Phase 1 runs from Terminal. The page names the failure ("macOS refused Bonjour: open System Settings › Privacy & Security › Local Network"). The server retries rather than quitting. |
| The application firewall identifies programs by their signature. Ad-hoc or unsigned builds are asked again after each update. | Tell the owner before each update. A Developer ID would fix it, but costs $99 a year, and the owner chose not to. |
| launchd no longer loads plists carrying the quarantine attribute. | Never write LaunchAgent plists from a download. Phase 2 registers its agent from inside the app bundle with `SMAppService`. |
| Sleep stops the server. | Automatically hold a power assertion while players are in: `caffeinate -i -w <pid>`, started on the first entry and ended on the last exit. Warn on battery and with the lid closed. Never change `pmset` for the owner. |
| `ProcessType` unset means launchd throttles the job. | The Phase 2 agent sets `ProcessType=Interactive`. |

**Phase 1: from Terminal** (milestone S2)
- `npm run world-server`, or `node server/world.js --port 8480 --data <folder>`.
- It prints the addresses, the admin key (first start only) and the page's URL, and opens the page.
- **Node.** 24 LTS now, 26 LTS from 28 October 2026. `engines.node` stays ">= 22" for the game's
  own checks.
- **Packaging.** A Homebrew formula in our own tap comes later. Formulae aren't bound by the cask
  Gatekeeper rule.

**Phase 2: a menu-bar app** (milestone S8)
- **The app.** A small SwiftUI menu-bar app, "Pellagos Server". It shows a status dot (running,
  players in, sleeping) and has these items:
  - Open the management page;
  - Start or stop;
  - Run at login (through `SMAppService.agent`, with `ProcessType=Interactive` and `KeepAlive`);
  - Quit, which saves first.
- **What it bundles.** Node arm64 and the server, with the game's client inside the bundle.
- **Info.plist.** `NSLocalNetworkUsageDescription` and `NSBonjourServices = [_pellagos._tcp]`.
- **Signing.** Ad-hoc and free: no Apple Developer ID (the owner's decision). It's distributed as a
  zip with a one-page guide to "Open Anyway" in Privacy & Security, since Control-click › Open no
  longer bypasses Gatekeeper from macOS 15. The firewall asks again after each update, and the page
  says so before an update.
- **As built (S8).** The app (`mac/`, Swift, macOS 13 or later) runs the bundle's Node on
  `server/world.js --app`, which says how it stands on lines of its own (`@pellagos {state,
  players, worlds, awake, page, play, version}`), saves every world and stops on SIGTERM (Stop,
  Quit, logging out), and stops the same way when the app's pipe to it closes, so it never
  outlives the app. Run at login registers the bundle's agent, which runs the app itself
  (`BundleProgram`), with `KeepAlive` `{SuccessfulExit: false}`: started again if it fails, not
  after Quit; a second copy opened leaves at once. Node keeps its own signature (the OpenJS
  Foundation's); the app is signed ad hoc around it. `scripts/build-mac-app.js` makes the bundle
  (`npm run build:mac`), and the macOS workflow (`.github/workflows/mac.yml`) builds, opens and
  quits it on GitHub's Macs. The guide is docs/MAC_APP.md.

**Updating** (both phases). The owner clicks; nothing updates itself.
1. Once a day the server checks the project's GitHub releases (free; can be turned off). The page
   then shows "Version 2.4.0 is out", with its notes.
2. **Update** downloads the release archive and checks it against the release's signature: an
   Ed25519 key belonging to the project, whose public half ships with the server. Free, and no Apple
   signing involved.
3. It's refused while players are in: the owner tells players and sets worlds aside first.
4. It backs up every world and the settings ([§5.1](#51-settings-versions-and-upgrades)).
5. It unpacks the new version beside the old one, and restarts into it. Migrations run on first
   start.
6. If the new version fails to start or migrate, the server goes back to the old version and the
   backups, and says why. The previous version stays until the next update.

A server run from a git checkout shows the commands to update instead.

**As built (S9).** `server/world.js` is a launcher (`server/launch.js`): it runs the server itself
(`server/serve.js`) in a process of its own, as the version it came with or the newer one an update
installed in the data folder's `versions/<version>/` (the app's bundle is never changed, so its
signature holds), whichever is newer. The update (`server/update/updater.js`) unpacks the release
there, writes `versions/current.json` (`state: "trying"`, the backups it made), and the server
stops with exit code 75. The launcher starts the new version with `PELLAGOS_TRYING=1`; it brings
every world's latest save forward to its `SNAPSHOT_VERSION` (`server/reopen.js` `bringForward`)
before it listens, then tells the launcher it's running, which keeps it (`state: "kept"`,
`versions/last.json`, the journal) and lets go of all but it and the version before. If it ends
with an error first, or says nothing for 3 minutes, the launcher puts the server's own files and
every world back from the backups, names the version before in `current.json` (or nothing, if
that's its own), and starts it; `last.json` and the journal say why. What a newer version must
keep for an older launcher (`serve.js`, its arguments, the message, exit code 75,
`PELLAGOS_TRYING`) is in contribution.md's version rules. The project's key pair is made by its
owner (`npm run release-key -- --new`); until it is, servers show new versions but can't install
them. Homebrew's server shows `brew upgrade` instead.

**Other platforms.** macOS comes first. Everything platform-specific sits in the platform layer
([§2](#2-the-shape-of-it)): folders, keep-awake, Bonjour, secrets and running at login.

- **Linux or Windows** later means one more file in `server/platform/`, plus notes for its firewall
  and service manager.
- **A Docker image** for home servers and NAS boxes is a small step after Linux.
- **Nothing outside the platform layer** may call a macOS-only command. A test checks that by
  running the whole server suite on Linux in CI.

---

## 12. The protocol

Two parts on one port: an HTTP JSON API for listing and management, and two WebSockets for play
and brokering. All of it is versioned: the API by its path (`/api/v1`), the sockets by subprotocol
(`pellagos.play.1`, `pellagos.broker.1`), and play by `NET_VERSION`, as today.

### 12.1 HTTP: `/api/v1`

| Method and path | Needs | Does |
|---|---|---|
| `GET /status` | nothing (rate-limited) | The server's card (its id, name, public key, version, `NET_VERSION`, play socket) and addresses (at home, and where the internet reaches it now), where the caller seems to be (`you: {address, from, home}`: home is from the Wi-Fi, or from the home's own public address the long way round), its listed worlds with player counts and hero names, nearby servers (`[{name, id, version, net, worlds, address, ip}]`: [§8.2](#82-nearby-macs)), listed players' worlds, and versions ([§8.1](#81-servers-the-player-knows)) |
| `GET /health` | nothing | `ok` or `slow` |
| `POST /reachability` `{results: [{address, ok, ms, socket, error}]}` | nothing (rate-limited) | What a game found trying to reach the server from elsewhere ("Test this server"), at the server's own addresses alone, kept for its page (the last 5) |
| `POST /enter` `{world, key?, ticket?, net?}` | a key or ticket | `{session, ticket?, role, world, card, player, heroes, life, position}`, where `card` is the world's as `/status` lists it (its heroes mode and first-hero rule among it) and `heroes` lists the player's kept heroes in kept worlds (up to 6). Refusals say why: `no-world`, `key`, `banned`, `full`, `locked`, `version` (`net` isn't the server's `NET_VERSION`), `wait n`. Too many worlds running isn't a refusal: `life` says `waiting` and `position` its place, and the play socket waits its turn |
| `POST /codes/redeem` `{code}` | a short code | Trades it, once, for `{world, key}`, then as `/enter` |
| `GET /worlds` | a session or the admin key | Listed worlds, plus unlisted worlds the caller holds keys for |
| `POST /worlds` | a creator key or the admin key | Make a world (unlisted). Returns `{world, ownerKey, playerKey}` |
| `PATCH /worlds/:id`, `DELETE /worlds/:id {confirm}` | owner | Change settings, or delete (with the world's name typed) |
| `POST /worlds/:id/start`, `/aside`, `/save` | owner | Lifecycle |
| `GET`, `POST`, `DELETE` `/worlds/:id/keys[/:key]`; `POST …/keys/:key/replace`; `POST …/codes` | owner, or trusted if the world allows | Keys and short codes |
| `GET /worlds/:id/players`; `POST …/players/:p/kick`, `/ban`, `/unban`, `/role`, `/ticket` | owner | Players, including reissuing a lost ticket |
| `GET /worlds/:id` | owner | Everything its owner's shown of it, its state in words and its clock |
| `POST …/keys/:key/show`; `DELETE …/codes/:code` | owner | A key that works shown again (as text, link and QR code); a short code revoked |
| `GET`, `POST` `/worlds/:id/backups`; `POST …/backups/:b/restore`; `GET …/backups/:b/download`; `GET …/export`; `POST /worlds/import` (S9: the export's bytes as they are, gzipped or not, up to 64 MB) | owner (import: `world.create`) | Backups and moving worlds |
| `POST /server/session` | the admin key, from the home network | A session for the page from the Wi-Fi, kept in its tab alone |
| `GET`, `PATCH` `/server`; `GET /server/worlds`, `/server/journal`, `/server/health`; `GET`, `POST`, `DELETE` `/server/creators`; `GET`, `POST` `/server/update` (S9: `{check}` asks now, `{version}` updates) | admin, from the Mac or the home network only | Settings, every world, the journal, health, creator keys and updating |
| `PUT /server/certificate` `{key, cert}`, `DELETE /server/certificate` | admin, from the Mac or the home network only | A certificate of the owner's own (PEM: its key, and its chain), checked and kept in `certificates/`, taken up without a restart; or taken out (the internet's then no longer answered) |
| `GET`, `POST`, `DELETE` `/server/certificate/acme`; `POST …/acme/renew`; `POST /server/router`; `POST /server/funnel` | admin, from the Mac or the home network only | Free certificates set up, asked for now, or forgotten ([§9.2](#92-free-certificates)); the router asked again ([§9.3](#93-opening-the-router)); Tailscale Funnel asked for again ([§9.4](#94-behind-cgnat)) |
| `POST /server/admin-key`, `/server/stop` | the Mac's own listener alone | A new admin key (the old no longer works); stopped, every world saved |

- **Authorisation.** `Authorization: Bearer <session>`; or `Authorization: Key <key>` for the admin key or a creator key (or the key in a POST's body). Nothing goes in a query string: a request with one is refused.
- **Errors.** `{error: code, message}`.
- **CORS.** The calls the game makes answer cross-origin, so they work from GitHub Pages: `/status`,
  `/enter`, `/codes/redeem`, `/worlds` and a world owner's calls. Server management answers only to
  the server's own origin, and only from the Mac or the home network.

### 12.2 WebSocket `/play` (subprotocol `pellagos.play.1`)

The framing is today's relay framing (a first line, `\n`, then the payload), so `RelayLink`'s
heartbeat, backoff and grace carry over unchanged. Only the place lines differ.

| Today (relay) | Server world |
|---|---|
| (nothing) | `hi NONCE` → `hi SERVER-ID PUBLIC-KEY SIGNATURE`: the server proves its identity before anything secret is sent ([§7.6](#76-the-servers-identity)) |
| `join CODE` → `joined pN TOKEN` | `enter WORLD SESSION` → `entered pN TOKEN` |
| `rejoin CODE PEER TOKEN` | `reenter WORLD PEER TOKEN` |
| `data\n…` to the host | `data\n…` to the world worker |
| `away`, `back`, `closed` | `away` and `back` (the world is restarting), `closed REASON` (`kicked`, `afk`, `banned`, `key-revoked`, `world-deleted`, `server-stopping`) |

- **What's inside is unchanged.** `data` carries today's netplay messages: `hello`, `welcome`,
  `ops`, `motion`, `state`, `paused`, `ping`, `pong`, `chat`.
- **Two new message kinds**, joiner to host: `ready` (finished loading, which starts a frozen
  clock) and `away {hidden}` (tab hidden or shown).
- **`hello` gains a field:** `hero` (which of the player's kept heroes, by its slot, or `new`). Who
  the player is comes from the session they entered with, so the ticket isn't sent again. In kept
  worlds the hero comes from the server, and the client's `character` is ignored unless the world
  allows bringing one in on the first visit; a new hero takes only its looks from it.
- **Waiting its turn.** If the world isn't running and `worldsAtOnce` are, the server sends
  `waiting N` (its place) until it is, then `entered`.
- **Refusals** close the socket with `closed REASON`, the same reasons as `/enter`'s, and
  `too-many` (more than 3 sockets on a ticket), `newer` (a newer version kept the world), `gone`
  (a `reenter` too late).
- **AFK lives in the rules.** Each player's last-command step is part of the host's state, so every
  replica shows the AFK icon at the same step. The 30-minute kick is a recorded leave op, so replay
  stays exact.
- **`NET_VERSION` bumps** with these changes.
- **Limits.** Joins are throttled: at most 2 welcomes (full snapshots) sent at once, as Factorio's
  `max_upload_slots` does.

### 12.3 WebSocket `/broker` (subprotocol `pellagos.broker.1`)

| Message | From | Does |
|---|---|---|
| `broker {ice, relaying}` | the broker, first | The STUN servers to try, and whether it relays; said again if relaying's turned on or off |
| `announce {name, people, players, most, net, visibility, direct, local, temporary}` → `announced ID TOKEN` | a browser host | List their world; `direct` and `local` are the reachability check's; ID is the world's code |
| `keep ID TOKEN` (and `{players, visibility}`) | a browser host | Keep the announcement alive every 15 s (it expires after 45 s), saying what's changed; from a new link it's the host's again (`announced`, then `here pN…`) |
| `withdraw ID` | a browser host | Take it down |
| `watch` → `seen [...]`, then `+ {…}` and `- ID` | anyone | Follow the list of players' worlds |
| `connect ID` → `peer pN` | a joiner | Start a connection; its host's told `peer pN {near}` |
| `signal pN {sdp or candidate}` | either side | Passed on as is (the broker reads only the target) |
| `relay pN` and then today's relay verbs | either side | Fall back to relaying through the server: both told `relay pN` (or `error relaying-off`); `away`, `back`, `closed` and `gone pN` as the relay has them |

The broker caps announcements at 3 per address and 100 in all. It caps signalling at 50 messages a
connection attempt, and checks `Origin` ([§13](#13-security)).

---

## 13. Security

A Node server opened to the internet needs these from its first day.

**Who may talk to it**
- **Plain only at home.** Plain `http`/`ws` is accepted only from home addresses. From the internet,
  TLS only ([§9.1](#91-one-port-two-kinds-of-connection)).
- **Management never from the internet.** Key-free management lives only on `127.0.0.1:8481`
  ([§7.3](#73-the-owner-and-claiming-the-server)). The admin key works only from home addresses that
  reached the server directly. Tunnel traffic arrives on `127.0.0.1:8482` and is always treated as
  internet traffic.
- **The server proves itself first.** No key or ticket is sent until the server has proved its
  pinned identity ([§7.6](#76-the-servers-identity)).
- **Origin checks** on both sockets and on cross-origin API calls, as an exact allowlist with no
  wildcards and `null` refused. Allowed: the server's own origins, `https://hoffspot.github.io`,
  any origins the owner adds, and the pages of the Pellagos servers it's found nearby, each by the
  exact addresses it found them at ([§8.2](#82-nearby-macs)): never for its management, which
  answers its own pages alone. This stops cross-site WebSocket hijacking; it doesn't stop bots, which
  is what keys are for.
- **Guarding against DNS rebinding** on every listener. Requests whose `Host` isn't one of the
  server's own names or addresses are refused.
- **Guarding against cross-site requests.** Management calls also need a custom header
  (`x-pellagos: manage`), which no other site's page may send (the server never allows it across
  sites); on the Mac's own listener, where being there is the proof, they need the same-site cookie
  the page was given as it loaded too, so another website open on the Mac can't drive them. From
  the Wi-Fi the page's session goes in a header, which no other site can send at all.
- **Sign-in comes first.** Authentication is in the first message, never in a URL's query string.
  A socket that hasn't entered within 10 s is closed.
- **What strangers see** is only the rate-limited status card and the worlds the owner has listed
  ([§8.1](#81-servers-the-player-knows)).

**How much it will take**
- **Size caps.** 4 MiB for `welcome` and `state` (the snapshots), and 64 KB for every other message
  (OWASP's guide). The 8 MiB backlog and the pings with timeouts stay as today.
- **Rate caps.** About 100 messages a minute per player for chat and signalling. Game commands get
  their own, higher, cap.
- **Connection caps,** per identity first:
  - 3 sockets per ticket;
  - 32 per address, set high because CGNAT shares addresses;
  - 64 players across the server.
- **Temporary blocks.** An address with 20 refused entries or bad requests in 10 minutes is blocked
  for 15 minutes. The block grows on repeats and shows on the page.
- **Bans** follow the player's ticket for good and their address for 24 hours ([§7.4](#74-roles)).
- **Other guards.**
  - Slow-request and idle timeouts on HTTP;
  - a fuzz test for the hand-written WebSocket parser;
  - compression (permessage-deflate) left off, as the `ws` library advises for servers.

**Keys and secrets**
- **Storage.** Keys and tickets are stored hashed, never logged, and carried in URL fragments
  rather than query strings.
- **The internet needs TLS,** from the server's own certificate ([§9.2](#92-free-certificates)) or
  Tailscale Funnel's. On the Wi-Fi, plain `http`/`ws` is accepted, and the page says traffic there
  isn't encrypted.
- **Certificates and keys on disk** (`certificates/`, `identity.key`, `secrets.json`) are `0600`.
  The DuckDNS or DNS-host token is a secret too: it lives in the platform's secret store (the macOS
  Keychain through `/usr/bin/security`, the token given on its standard input, never a command
  line) where there is one, otherwise in `certificates/tokens.json` (`0600`). It's never shown
  again, journalled, or kept beside the route (`certificates/acme.json`).

**What the server trusts**
- **Players' input.** Only commands. In kept worlds the hero comes from disk.
- **Brought-in heroes.** They go through `characterFrom` and then the policy's `admits` check.
- **Files it writes.** `world.json` and `server.json` are written only by the server, never edited
  by hand while it runs. Vintage Story and Necesse overwrite hand edits, a known source of lost
  settings.

---

## 14. What other servers do, and what we adopt

| Feature | Seen in | Here |
|---|---|---|
| Pause when no one is connected, on by default | Factorio `auto_pause`; Satisfactory Auto Pause; Minecraft `pause-when-empty-seconds` (60 s); Terraria hibernates; Vintage Story | Frozen the moment the last player leaves ([§4](#4-a-worlds-life-and-its-time)) |
| Don't start an empty world until the client has fully connected | Terraria 1.4.5.7 | The clock waits for `ready` |
| Optionally pause while someone joins | Factorio `auto_pause_when_players_connect` | "Hold the world while someone joins", off by default |
| Save when the last player leaves | Terraria 1.4.5; Satisfactory | Saved on going empty |
| A setup screen of many worlds; immutable ids with editable names; delete by typing the name | Foundry VTT | The Worlds section ([§10](#10-the-servers-management-page)) |
| Remote world lifecycle (create, list with save details, load, upload, download, delete) | Satisfactory HTTPS API | `/api/v1/worlds…` ([§12.1](#121-http-apiv1)) |
| Claim the server; admin vs player passwords; changing a password ends sessions | Satisfactory | The admin key, world keys, replacing ends sessions ([§7](#7-keys-identity-and-the-access-hooks)) |
| The password picks the role | Enshrouded user groups | Each key carries a role |
| Invite links with expiry and a limit | Minecraft Realms (7-day default, 5 links) | Optional expiry and use counts, up to 10 live keys; short spoken codes that last 15–60 minutes |
| Stable invite codes (not new on every restart) | Valheim's join codes change each restart and players complain | Keys last until revoked |
| Characters kept on the server | Factorio, Satisfactory, V Rising, Foundry; Valheim needs mods | "Kept by the world" mode ([§6](#6-heroes-kept-by-the-world-or-brought-in)) |
| A reconnect window that keeps your place | V Rising `SafeReconnectTime` | 30 s grace, frozen if alone |
| Throttle full-map downloads | Factorio `max_upload_slots` | 2 welcomes at once |
| Status ping with version, players and description | Minecraft server list ping (with its player sample) | `GET /status`: the card and listed worlds, with player counts and hero names |
| Rotating autosaves and tiered backups | Factorio (5 slots); Palworld (30 s, 10 min, hourly, daily); V Rising SmartKeep | 5 autosaves, 12 hourly, 7 daily ([§5](#5-saving-the-whole-world)) |
| Back up before migrating a world to a new version | Foundry; Valheim 1.0 | Always |
| Admin API on localhost by default; TLS and tokens when exposed | Minecraft management protocol; Palworld's "don't expose the REST API" | Management on the Mac without a key, from the home network with the admin key, never from the internet; play from the internet only over TLS |
| UPnP on by default, with a reachability check | Foundry `upnp: true` | Router mapping and "Test this server" ([§9.3](#93-opening-the-router)) |
| Serve the matching client | Foundry (players need only a browser link) | The server serves its own build |
| Graceful stop that saves | Valheim's "closing the window leaves it running" trap | Stop saves; the page says when it's safe |
| AFK kick | Factorio `afk_autokick_interval` | An AFK icon at 10 minutes, a kick at 30 |
| Sleep needs everyone | Minecraft's sleep rule (`playersSleepingPercentage`, 100% by default) | Time passes when everyone present rests ([§3](#3-running-a-world-without-a-browser)) |
| A browser reaches a home server securely | Plex's per-server certificates under `plex.direct` (needs a paid CA partnership and trips routers' DNS-rebinding guards); Home Assistant's relay (paid) | The free routes of [§9](#9-reaching-the-server): the Mac's own page on the Wi-Fi, free Let's Encrypt certificates by DuckDNS name or by IP, and Tailscale Funnel behind CGNAT |
| Devices known by a key's fingerprint, pinned on first use | Syncthing device ids; SSH host keys | The server's id is its key's fingerprint, checked before any key is sent ([§7.6](#76-the-servers-identity)) |
| "Same network" from the same public address | Philips Hue bridge discovery | The broker's "probably on your network" hint ([§8.2](#82-nearby-macs)) |
| Signalling broker with peers relaying when direct fails | PeerJS PeerServer (listing off by default); Syncthing relays | The broker, with relaying over its WebSocket ([§8.3](#83-players-running-the-game)) |

The sources for each row are in `research_notes/Standalone world server hosting/`
(`dedicated_servers.md`, `network_discovery_access.md`, `macos_hosting.md`), which isn't committed.

---

## 15. Milestones

Each one is a pull request that leaves the game playable, and each lists what proves it. They come
in the user's order:

1. server worlds on the Wi-Fi (S0–S5);
2. the open internet port (S6);
3. browser worlds through the broker (S7);
4. the menu-bar app (S8);
5. running it for real (S9).

**Where it stands.**
- **S0, done.** The runner (#361), worlds without a host player and AFK in the rules (#362), made
  ahead on Node (#363), and the cross-engine soak (#364). Measured: no resyncs in 32 minutes in
  Node, Chromium, WebKit and Firefox; AFK marked and sent out at the same step on every copy; no
  step over 50 ms walking about in the four towns. A field battle's first steps still reach
  140 ms now and then, and the soak lists them (docs/WAR.md, "The soak").
- **S1, done.** The data folder, its layout's and settings' versions, atomic writes and the
  platform layer's folders (`server/storage/`, `server/platform/`); worlds kept (`worlds.js`:
  `world.json`, the snapshot and five autosaves, a spoilt save passed over, the journal); the
  heroes a world keeps (`heroes.js`, six a player); a running world saved on each war turn and
  when asked (`server/keeper.js`); the snapshot's steps forward from version 26, with a fixture of
  each version (`SNAPSHOT_STEPS`, `test/fixtures/snapshots/`); a world opened, refused if a newer
  version kept it, or started afresh from its seed (`server/reopen.js`); and a solo world brought
  in. Measured: saved in one process and restored in another, a world has the same checksum, and
  200 steps on it still has.
- **S2, done.** Keys, tickets, sessions, short codes, the access hooks and the server's identity
  (`server/access/`); each running world in a thread of its own, its clock running only while
  someone's present, and the registry setting worlds aside and holding a third while two run
  (`server/world-worker.js`, `world-thread.js`, `registry.js`); the one port, home addresses only
  until S6, with `/api/v1`, the play socket and the game's own files behind its guards
  (`server/world-server.js`, `api.js`, `play.js`, `guards.js`); `npm run world-server`.
  Measured: a world entered from stored in 3.7 s, its thread about 110 MB, given back when it's set
  aside; the war's clock just where it stopped across a leave and a set-aside.
- **S3, done.** The game's side: the servers a player knows, kept with each world's key and
  ticket and carried as a code (`client/js/app/servers.js`); the server's identity checked with a
  small vendored verifier and pinned, nothing secret sent to a server that proves to be another
  (`core/identity.js`); into a world by a key, a ticket, a short code or an invite link; the play
  socket on the relay's link (`app/together.js`); the title's **Worlds on servers** screen, a world
  made, a kept hero chosen or a new one, and the in-game **World** panel (who's here, invite links
  and short codes, keys, leaving). Measured: two browsers, a world made, shared, played in, left,
  set aside and come back to, in under two minutes in CI's software drawing.
- **S4, done.** The management page (`client/admin.html`, `client/js/admin/page.js`): on the
  server's computer at `localhost:8481`, its own listener on loopback needing no key
  (`server/admin.js`), and from the Wi-Fi at `/admin` with the admin key traded for a session;
  every section of [§10](#10-the-servers-management-page) but updating (S9). What owners and the
  admin can do (`server/manage.js`): a world's settings, its heroes mode among them (while it's set
  aside); started, set aside, saved; its players sent out, banned, given another part or a new
  ticket; its backups (the autosaves, and the ladder: one an hour, one a day, and by hand) made,
  restored and downloaded; exported; deleted with its name typed (a last backup kept). The server's
  settings, creator keys, a new admin key (on the computer alone), its journal and every world's,
  health, the recommended worlds at once, and stopping it. QR codes of its addresses and of every
  key and invite (qrcode-generator, vendored: `npm run vendor:qrcode`). Measured: the page's e2e
  (a world made, started, set aside, backed up, restored, a ticket reissued, its heroes mode
  switched, deleted) in 7 s.
- **S5, done.** Nearby Macs ([§8.2](#82-nearby-macs)): Bonjour in the platform layer
  (`server/platform/bonjour.js`, with `dns-sd` on macOS and Avahi's tools on Linux, each read as it
  talks; Windows refuses, saying so), and `server/nearby.js`: the server advertised as
  `_pellagos._tcp` under the computer's own name, the others browsed for, resolved and listed under
  `nearby` in its status (never itself), lost when they go; advertised again (at most every 10 s)
  when what its TXT record carries changes. Refused (the Local Network permission's codes, a
  responder not running, no tools), it says what to do, on the page and in Terminal, and tries
  again a minute later; play carries on. The `bonjour` setting turns it on and off as the server
  runs. The game lists the servers a known one finds, "Nearby", each added with a tap, the id it
  advertised expected; and a nearby server's own pages may use this one (by their exact addresses:
  [§13](#13-security)), since the game from any of them plays on all. Measured: the unit tests with
  a fake responder, and the game adding a nearby server in a browser in 6 s. The manual check on two
  Macs is the owner's: it needs macOS.
- **S6a, done.** TLS on the one port ([§9.1](#91-one-port-two-kinds-of-connection)): each
  connection handed on by its first byte to the port's https half or its plain one; the server's
  certificate kept in `certificates/` (`server/storage/certificates.js`: checked that its key is
  its own and it hasn't run out, `0600`), taken up without a restart (when it's put in, and looked
  at every 10 minutes, so one put there by hand is found and one that's run out let go), its names
  the server's own too; certificates and their requests made on `node:crypto` alone, for ACME
  (`server/net/der.js`, `x509.js`: PKCS #10 with the names in subjectAltName, and TLS-ALPN-01's
  self-signed answer). The internet policy (`server/guards.js`): with **Answer the internet** on
  and a certificate, the internet over TLS alone; plain from there refused (`secure`), a page sent
  on to its `https://` address (308), the play socket refused; never the admin key nor the
  management page; turned off, or the certificate let go, everyone in from there sent out
  (`internet-closed`). Each request knows whether it's from home or the internet, and the access
  hooks are told so. The management page says how it stands with the internet, with the
  certificate's names, issuer, end and fingerprint, and takes a certificate of the owner's own.
  Measured: the game from a server's secure address, the browser on the internet, following an
  invite into a world and playing over `wss://`.
- **S6b, done.** Free certificates ([§9.2](#92-free-certificates)), got and renewed by the server
  itself. An ACME client on `node:crypto` alone (`server/net/acme.js`, RFC 8555): an ES256 account
  (`certificates/account.key`, `0600`), its terms agreed by the owner; nonces, a stale one tried
  again; orders under a profile (the IP route's "shortlived"), naming the certificate a renewal
  replaces, and the CA's renewal window asked (RFC 9773). Three routes (`server/certify.js`): a
  DuckDNS name and an own domain on Cloudflare or deSEC prove themselves by DNS-01 through the DNS
  host's API with the owner's token (`server/net/dns-hosts.js`), the record waited for at the
  zone's own nameservers before the CA's asked to look; this home's IP address by TLS-ALPN-01 on
  the one port (RFC 8737, 8738: the reverse name by SNI, `acme-tls/1`, a certificate of its own
  carrying the key authorization's hash). A DuckDNS name is kept pointed at the home every 5
  minutes. Renewed when the CA says, looked at every hour; a failure keeps the certificate there
  is, says why (on the page, in the journal, in Terminal) and tries again after an hour, then 6,
  then 24. Tokens in the Keychain on macOS (`server/platform/darwin.js`), elsewhere in
  `certificates/tokens.json` (`0600`), never shown again. The management page sets a route up
  (the CA's terms linked), shows how it goes, asks for one now, or stops. Measured against a
  certificate authority of the tests' own (`test/fake-acme.js`) that checks every request and every
  proof as Let's Encrypt does, rather than Pebble (a Go program, not something `npm test` can run
  on every system): each route's certificate got and taken up on a running server, renewed when
  it's due naming the one it replaces, failures backed off, and the token never in a reply, a file
  beside it, or the journal.
- **S6c, done.** The router asked ([§9.3](#93-opening-the-router)) while the internet's answered:
  PCP, then NAT-PMP, then UPnP-IGD (`server/net/pcp.js`, `natpmp.js`, `upnp.js`, over
  `server/net/udp.js`), each mapping asked for 2 hours and renewed at half-life (a PCP mapping by
  its own nonce); the play port the same outside, and the internet's 443 to the server's second
  port while the certificate's route is the IP address. An IPv6 pinhole for this computer's global
  address, by PCP over IPv6 or UPnP's IPv6 firewall, kept the same way (PCP's by its nonce, UPnP's
  by UpdatePinhole). Let go when the internet's no longer answered
  or the server stops. The gateway from the platform layer (`route` on macOS, `/proc/net/route`
  and `ipv6_route` on Linux, none yet on Windows). Then how far it got (`server/router.js`): the
  public address by STUN (`server/net/stun.js`), a provider's sharing told apart (100.64/10, a
  private address, or not the one the internet sees), and the hairpin. The management page says
  what the router forwards, or why it won't and how to forward the port by hand, and asks again
  on demand (`POST /server/router`); Terminal says it as it changes; **Ask the router** in
  Settings turns it off. Measured against a router of the tests' own (`test/fake-router.js`:
  PCP and NAT-PMP on one UDP port, SSDP, the IGD's description and SOAP control, STUN), each
  protocol's fallback and refusal, the pinholes, 443's second port, and CGNAT, in unit tests and on
  the page in a browser. The manual check on a real router is the owner's.
- **S6d, done.** The page's internet setup and Tailscale Funnel ([§9.4](#94-behind-cgnat)). The
  internet panel opens with one switch, **Open to the internet** or **Close to the internet**
  (closing lets the router's forwarding and Funnel go and sends out everyone in from the internet),
  then **A way in**: a free certificate, one of the owner's own, or **Tailscale Funnel** (named the
  way in when the router says the provider shares the address); then the router; then **Tested from
  outside**. Funnel (`server/funnel.js`, Tailscale's command from the platform layer): asked for
  while the server's open to the internet and the `funnel` setting's on, never taking over what the
  owner serves already, each way it can't be had said (not installed, signed out, not allowed on the
  tailnet with the link to allow it), looked at again every 10 minutes, let go when closed. The
  tunnel listener (`127.0.0.1:8482`, the `tunnelPort` setting) opens with it: everything there is
  the internet's (`server/guards.js`: from X-Forwarded-For's last address, by Funnel's name or the
  tunnel's own address, plain since the TLS was Tailscale's), needs no certificate of the server's,
  and is sent out when the internet's closed. `/status` lists where the internet reaches the server
  now (its secure addresses and Funnel's) and where the caller seems to be (`you`); `POST
  /reachability` keeps what games found testing it from outside, for the page. Measured against a
  Tailscale of the tests' own (`test/fake-tailscale.js`): Funnel asked for and let go, each refusal,
  the play socket through the tunnel, the reports; and the page in a browser. The manual check with
  a real tailnet is the owner's.
- **S6e, done.** The game's side ([§9.1](#91-one-port-two-kinds-of-connection),
  [§9.3](#93-opening-the-router), [§9.5](#95-from-the-github-pages-copy)), in `app/servers.js` and
  the Worlds screen. **Test this server**: each of a server's internet addresses tried from the
  device (its card, and its play socket, the server proving it's the one meant), what was found said
  and sent to the server's page (`POST /reachability`), and said to prove nothing of the internet
  when the device is at the server's home; the management page shows a code to scan on a phone on
  its cellular data, which opens the game at the server's internet address and tests it at once
  (`#test`). Home and away: a known server's addresses kept from its card with whether the player
  was at its home, and tried in turn, the one that last answered first. An address typed bare is
  tried secure first unless it's at home and the page isn't. A page opened over https that can't
  reach a server at home over plain http says so and hands the player to the server's own page, the
  server, its id, and a world's key or ticket in the link. Measured: the game reaching a server by
  another of its addresses and passing over another server's card, the tests against a server
  through Funnel's tunnel (unit and in a browser, from the Worlds screen and from `#test`), and the
  hand-off from an https page. The manual check from a phone on cellular, in Safari and Chrome, by
  DuckDNS name and by IP, is the owner's.
- **S7, done.** The broker and players' own worlds ([§8.3](#83-players-running-the-game),
  [§9.6](#96-webrtc-between-browsers), [§12.3](#123-websocket-broker-subprotocol-pellagosbroker1)).
  `server/broker.js` on the one port, with its two settings (`broker`, `relaying`), its caps, and
  the guards' checks; the status card's `players` (listed players' worlds, as the caller sees them)
  and `server.broker`. The game's `app/peer.js`: `BrokerHost` and `BrokerJoin`, links `Hosting` and
  `Joining` use as they do the relay's; one reliable, ordered data channel for each who joins,
  messages in 16 KB pieces with back-pressure; relayed by the server when no direct link opens in
  10 s, or refused when it doesn't relay; an ICE restart when a direct link drops, relayed if it
  isn't back in 5 s; the reachability check (`direct`: a public address of its own, or one mapped
  alike for every STUN server; `local`: any). **Invite others** opens the world through the
  server the game came from, else the first known server that brokers, else today's relay (kept
  for one release; `?relay=` still asks for it); its code is the broker's, and a link to join by
  names the server when it isn't the page's own (`?join=CODE&at=…`); **List it on** a server lists
  it there. The Worlds screen lists each server's players' worlds (linked directly, on your network,
  or through the server), joined with a tap. Measured: the broker over real sockets (listed, kept,
  changed, withdrawn, expired, taken back on a new link, relayed, refused); games over it in Node
  with a WebRTC of the tests' own (point to point and relayed, a world played after the host's with
  no desyncs); and two browsers on loopback, joined point to point from the Worlds screen, and
  relayed (no ICE getting through) with the world hidden once the server doesn't relay. Not yet:
  one world listed on several servers at once (one broker per world for now), and the server's
  own STUN responder (the free public ones, or none, as its owner says).
- **S8, done.** The Mac app ([§11](#11-on-the-mac), docs/MAC_APP.md). `server/world.js --app`:
  how the server stands, a line whenever it changes; stopped, every world saved, by SIGTERM or
  its input closing. The menu-bar app (`mac/`, SwiftUI's `MenuBarExtra`): the dot (stopped;
  running, nobody in, so the Mac may sleep; players in, kept awake; starting or stopping), **Open
  the management page**, **Start**/**Stop**, **Run at login** (`SMAppService.agent`), **Quit**
  (every world saved first), the server's output in its log. The bundle
  (`scripts/build-mac-app.js`, `npm run build:mac`): `Info.plist` (`LSUIElement`,
  `NSLocalNetworkUsageDescription`, `NSBonjourServices` `_pellagos._tcp`), the launch agent
  (`ProcessType` Interactive, `KeepAlive`), Node 24.21.0 arm64 checked against its release's
  `SHASUMS256.txt` and the hash kept, the server and the game, signed ad hoc and zipped; the
  server's source archive and a Homebrew formula (a brew service, Interactive). The macOS
  workflow builds it all on a Mac, opens the app, sees its server answer, quits it with every world
  saved, and installs and tests the formula. Measured: `test/world-app.test.js` and
  `test/mac-app.test.js` here (the bundle's server run from inside it as the app runs it), and the
  workflow on GitHub's Macs. Not done here, as it needs a Mac and a person: the manual check
  ([§15](#15-milestones)'s table, docs/MAC_APP.md's list), and publishing the tap and a release,
  which are the owner's.
- **S9, done.** Running it for real (docs/SERVER.md). A world brought in from its export (`POST
  /worlds/import`, the page's **Or bring a world in**: up to 64 MB, gzipped or not, one from a newer
  server refused, keys of its own here), and a world restored from each kind of backup (an autosave,
  the hourly and daily ladder, one made by hand, one made before something). Updates
  ([§11](#11-on-the-mac)): the project's GitHub releases (`server-v<version>`) asked once a day,
  each archive signed with the project's Ed25519 key (`npm run release-key`; the Mac workflow signs
  what it builds with the `PELLAGOS_RELEASE_KEY` secret); installed only when nobody's in, every
  world and the server's own files backed up first, unpacked beside the version running and started
  by the launcher (`server/world.js`, `server/launch.js`), which keeps it once it's brought every
  world forward, or puts everything back and says why. The page's **Updates** (the commands instead
  for a copy of the repository and for Homebrew), the menu-bar app's **Updating**. `docs/SERVER.md`
  for whoever runs one, contribution.md, and README's "Playing together" rewritten. The soak (`npm
  run soak:server`, `scripts/server-soak.js`): a world server with 8 players in Node, each in a
  process of its own, playing by themselves (`core/bot.js`), each an owner starting a field battle
  every four minutes. It found three things, each fixed here: every field battle's victors and its
  lines stayed in the world for good (now let go once it's done: `FIELD_BATTLE.linger` and `lasts`,
  the host's `fields`; `SNAPSHOT_VERSION` 28, `NET_VERSION` 118, as #381's to #384's creatures took
  114 to 117); past 64 floors of open buildings, the server let go of one floor's mesh to bake
  another, over and over, its world's thread busy 60% of a core (every open building's floors kept
  now: `AHEAD.spare`); and the players' own copies of the world, on the same 4 cores, took them from
  the world's thread mid-step, so its steps looked slower than they were (the players run at a lower
  priority now, and the thread's own CPU time is reported beside its steps). Measured, two hours on
  seed 2: the world's memory 136 MB an hour in and 130 MB at the end (−5%; 116 to 236 MB in any
  minute); every minute's 99th-percentile step under 50 ms once all were in, the worst 30.4 ms (8.3
  ms on average over the first half hour, 22.1 ms over the last), the mean 4.4 ms; the world's
  thread 18% of a core on average, 32% at the most; the server's process 392 to 469 MB; every player
  in throughout, their copies kept to the host's (1,436 checksums and 35,890 motion checks each, all
  matching), and 240 field battles fought. The steps' 99th percentile drifted up over the two hours
  as the war went on round eight towns (the battle from about 260 to 580 between fights): one for a
  longer soak to watch. An update from 98.0.0 to 99.0.0 brought every fixture world forward, and a
  broken 99.0.1 was rolled back with every world as it was (`test/update.test.js`, real processes).
  Not done here, as they're the owner's: the project's key pair, a first signed release, and the
  checks on a Mac.

| # | Milestone | Proven by |
|---|---|---|
| **S0** | **The runner and host-free worlds.** `core/runner.js` takes the glue out of `game.js`, and the browser game uses it. Worlds with no `HOST_PLAYER` get their rules: resting passes time when everyone present rests; debug is owner-only. AFK goes into the rules: the last-command step, the icon over the head at 10 minutes, the kick at 30. Baking happens ahead in workers on Node. Plus the cross-engine soak. | Existing e2e unchanged. New: a Node runner with a Node joiner for 10 min with no resyncs. The soak: under 1 resync per player-hour in Chromium, WebKit and Firefox. No step over 50 ms in the 4-town run. AFK icon and kick at the same step on every replica. |
| **S1** | **The whole world saved, and versions.** Snapshot save and load via the runner, gzip, atomic writes, the heroes store (up to 6 per player). The version framework of [§5.1](#51-settings-versions-and-upgrades): the data folder, settings with schemas, the `SNAPSHOT_VERSION` migration chain with fixtures, refusing newer data. The "fresh start from the seed" fallback, and the solo-world import. | Save, restart the process, restore: identical checksum. Every fixture loads. A corrupt file falls back to an autosave. An older server refuses a newer folder, with the version it needs. |
| **S2** | **The server on the Wi-Fi.** The supervisor, world workers, the registry and the lifecycle of [§4](#4-a-worlds-life-and-its-time), with 2 worlds at once and the recommended maximum. The platform layer, macOS first. The one port, plain at home only. `/api/v1` (status, enter, worlds, create), `/play` and the server's identity. Keys, short codes, tickets, sessions, creator keys and the access policy. Limits, temporary blocks and bans. Keeping the Mac awake. `npm run world-server`. | Node clients over real sockets: make a world, enter with a key, leave (frozen: the war's clock identical), come back (same hero, same place), revoke the key (closed `key-revoked`). A short code redeems once. A third world waits while two run. Ending a worker frees its memory. Fuzz the socket. The whole server suite also runs on Linux in CI. |
| **S3** | **The game's Worlds screen.** Known servers, adding a server by address, status with listed worlds, entering keys and short codes, making a world. Heroes kept (choosing among up to 6, the first-hero rule, mode switching) or brought in. Identity pinning, invite links with the server in them, version mismatch handling. Exporting and importing "my servers and tickets". The in-game World panel: who's here, keys, leave. | e2e against a local world server: two browser contexts, one makes a world and shares the key; the other enters, plays and leaves; the world freezes; the second comes back to its hero. A changed server identity stops the game sending its key. |
| **S4** | **The management page.** Every section of [§10](#10-the-servers-management-page) (with a world's heroes mode switched, moved here from S3: it's a world's setting, `PATCH /worlds/:id`), the Mac-only listener, the admin key from home addresses (and never from the internet), DNS-rebinding and CSRF guards. | e2e of the page: make, set aside, back up, restore, delete, reissue a ticket. Tests that a foreign `Host` or `Origin`, and the admin key from a public address, are refused. |
| **S5** | **Nearby Macs.** Bonjour advertising and browsing, `nearby` in status, the page's addresses (their QR codes came with S4), clean failure when macOS refuses. | Unit tests with a fake responder. A manual check on two Macs on macOS 27.0.1. |
| **S6** | **The open internet port.** TLS on the one port, refusing plain connections from the internet. The ACME client: a DuckDNS name (suggested first), the owner's own domain, or the IP. Router mapping (PCP, NAT-PMP, UPnP) and IPv6 pinholes. The CGNAT check and the Tailscale Funnel helper with the tunnel listener. "Test this server", "Close to the internet", home-and-away addresses, and the GitHub Pages hand-off ([§9](#9-reaching-the-server)). | Unit tests against a fake router and a fake ACME server (Pebble). Plain `ws://` from a public address is refused. A manual check from a phone on cellular, in Safari and Chrome, by DuckDNS name and by IP. |
| **S7** | **The broker and players' worlds.** Presence, signalling, the WebRTC `Link` for browser-hosted worlds, the reachability check, the listing rule (direct, or "through the server" when relaying is allowed, or hidden), relay fallback, and the game's "Players" list. Today's `/relay` kept for one release, then removed. | e2e: two browser contexts on loopback connect over WebRTC through the broker. Forcing ICE to fail falls back to relaying, or hides the world when relaying is off. Announcement expiry. |
| **S8** | **The Mac app.** The menu-bar wrapper, bundled Node, the `SMAppService` agent, plist keys, ad-hoc signing, the "Open Anyway" guide, the Homebrew tap. | A manual check on macOS 27.0.1: first launch, firewall prompt, Local Network prompt, run at login, sleeps when idle, kept awake while players are in. |
| **S9** | **Running it for real.** Importing world bundles (the backup ladder, exporting and the journal came with S4), the update flow with signed releases and rollback ([§11](#11-on-the-mac)), the journal, `docs/SERVER.md`, contribution.md, and README's "Playing together" rewritten. | A 2-hour soak with 8 Node players: memory flat after the first hour, p99 step under 50 ms. Restore from each backup kind. An update from the previous release migrates every fixture world, and a forced failure rolls back. |

**For the repository's owner.** The server's tests run in `npm test`, so CI's `test` job (on
Linux) runs them with everything else: no new job, and nothing to add to the `main` ruleset.
The Mac app's workflow (`.github/workflows/mac.yml`, S8) runs on a Mac, by hand and on the pull
requests that change the app or its bundle. It isn't a required check, as most pull requests
never run it.

---

## 16. Risks and open questions

| Risk | What we do |
|---|---|
| Joiners in other browsers drift from a Node host | Measured first (S0's soak). Resync already recovers; drift above the target blocks S2. |
| `SNAPSHOT_VERSION` bumps often (26 so far), and every bump now needs a migration | Fixtures plus a test that fails when a bump has no migration. The "fresh start from the seed" fallback, never silent. |
| An open port invites strangers | Only TLS from the internet, an identity proof before any secret, nothing but the status card without a key, caps, temporary blocks, a socket fuzz test, and one switch to close it ([§13](#13-security)). |
| A home Mac behind CGNAT can't be reached however the router is set | The reachability test says so plainly and offers Tailscale Funnel, or browser worlds ([§9.4](#94-behind-cgnat)). |
| ~~Whether `duckdns.org` is on the Public Suffix List, and so whether DuckDNS users share Let's Encrypt's weekly limit~~ | Resolved in S6b: it is (the list's private section), so each DuckDNS name is its own registered domain for Let's Encrypt's limits. |
| IP certificates and IP links break when the home's IP changes | The server re-issues automatically and the page warns; the DuckDNS name, suggested first, avoids it. |
| macOS Local Network bugs (Bonjour, port mapping) on 27.0.x | Play doesn't depend on them. Each failure says what to do. A supported reset arrives in 27.2. |
| Pages (HTTPS) can't open `ws://` to a LAN address in Safari (Chrome and Firefox only after a prompt) | Every server serves the game itself, and the Pages build hands players over to it ([§9.5](#95-from-the-github-pages-copy)). With a certificate, Pages reaches the server's TLS address directly. |
| Tailscale Funnel's bandwidth cap is unpublished | Players load the game from GitHub Pages and use Funnel only for the socket, about 2 KB/s each. |
| Whether Chrome's local-network prompt also covers WebRTC is contradicted in Chrome's own sources | Tested in S7. Relaying through the broker is the fallback either way. |
| A browser world hosted on an iPhone vanishes when Safari is backgrounded | Marked "temporary"; announcements expire after 45 s. |
| Heroes, tickets and known servers live per browser origin, and Safari may wipe a site's storage after 7 days unvisited | Export and import of "my servers and tickets" as a code; owners can reissue tickets; a kept hero comes back with its ticket on any origin. |
| Hero names are shown to anyone who checks the server, for listed worlds | Only for worlds the owner lists, and new worlds start unlisted. Names are heroes' names, not players'. |
| Worlds with no host player hide other assumptions | S0 runs long host-free soaks. |
| Recast's wasm heap grows over long sessions | One worker per world, ended when the world is set aside. Memory is shown on the page. |

Every question the first version asked the user has been answered (§0 and the change log). New
questions go here as they come up.

---

## 17. Budgets

| What | Budget | How it's measured |
|---|---|---|
| Entering a stored world, until the clock runs | ≤ 5 s on an M1 (build 2.9 s plus restore plus welcome) | S2's test, timed |
| Memory per running world | ≤ 250 MB resident | Health page; S9's soak |
| Steps | mean ≤ 5 ms, p99 ≤ 50 ms with 8 players | The runner's telemetry |
| Saving | ≤ 100 ms in the world worker; the write is off the step | The runner's telemetry |
| A stored or empty world | 0 CPU | Activity Monitor; S2's test (no steps while empty) |
| Bandwidth per player | As today: about 1.2 KB/s motion and 0.5 KB/s ops | Health page |
| Welcome on the Wi-Fi | ≤ 2 s for a 350 KB snapshot | e2e, timed |

**Measured** by S9's soak (8 players, two hours, a 4-core Linux machine shared with the players'
own copies of the world): a world 116 to 236 MB (its thread's heap and buffers; 130 MB at the
end), its steps 4.4 ms on the mean and 30.4 ms at the worst minute's 99th percentile, its thread
18% of a core.

---

## 18. Change log

| Date | Change | Why |
|---|---|---|
| 2026-10-12 | First version, from a survey of `origin/main` (6aed84c) and three research notes: dedicated servers, networking and access, and hosting on macOS 27. | The user asked for a plan, no implementation: a standalone world server on macOS 27.0.1 with drop-in play, worlds that freeze when empty, keys, listings and research into similar servers. Their answers: Wi-Fi and internet; server lists plus nearby Macs plus players reachable point to point, with the server brokering WebRTC and addresses typed by hand; heroes chosen per world; a web management page. |
| 2026-10-12 | **Decisions from the user's questions and answers.** The internet model became one port that anyone can reach by DNS name or IP and port, safe by TLS-only from the internet, free certificates (DuckDNS name first, own domain, or IP), the server's pinned identity, and Tailscale Funnel behind CGNAT. The public card shows listed worlds with player counts and hero names; new worlds start unlisted. Management works from the home network with the admin key, never from the internet. Browser worlds stay through the broker; 8 players a world; up to 6 kept heroes per player; creator keys; resting needs everyone; empty worlds unload after 2 minutes; hidden tabs freeze; AFK icon at 10 minutes and a kick at 30; 2 worlds at once with a recommended maximum. The first hero is the owner's choice per world, the mode can be switched, and solo worlds can be imported. Short codes; trusted may invite if allowed; bans by ticket and by address for 24 hours. Terminal first, then a free menu-bar app with no Developer ID. macOS first behind a platform layer, with versioned settings and data so upgrades lose nothing. Owner-clicked signed updates, keep-awake automatic, 5/12/7 backups, port 8480. Rollout: Wi-Fi, internet, broker, Mac app. Added §5.1 (settings, versions and upgrades) and §7.6 (the server's identity); rewrote §9 (one port, certificates, router, CGNAT, Pages) and §15 (the milestones in the new order). | The user asked for a Q&A to settle every open question, and said they pictured a port opened to the internet that any host can reach by name or IP and port. |
| 2026-10-12 | **S0 built** (#361 to #364): the runner in `core/runner.js`, host-free worlds and AFK in the rules, made ahead on Node in worker threads, and the soak (`npm run soak`, `.github/workflows/soak.yml`). | S0's proofs met, as §15 says. What they found: a field battle's first steps can take 140 ms, so the soak lists every step over 50 ms for the work after S1. |
| 2026-10-12 | **Joiners too far behind** (docs/WAR.md, "Pace"): a joined game more than 100 steps (5 s) behind the host asks for the world as it now is rather than playing every step it missed, and everyone is drawn going to where it puts them (put straight there if that's further than 3 m). The soak counts these resyncs too. | The user asked for resyncs eased for players with lag, and a "too far gone" limit past which they're sent the world as it is. A phone hidden 30 s took 9.5 s to catch up step by step (modelled); it now takes half a second. |
| 2026-10-12 | **S1a built:** the data folder (`server/storage/folder.js`: `VERSION`, laid out anew a step at a time with a copy made first, and refused from a newer server, naming the server it needs), the server's settings (`server/storage/settings.js`: a schema for each, checked before writing, keys it doesn't know kept), atomic writes (`files.js`), and the platform layer's folders (`server/platform/`: macOS, Linux's XDG folders, Windows). contribution.md's version rules gained `LAYOUT_VERSION` and `CONFIG_VERSION`. | §5.1's framework comes first, so that the world saves of S1b are versioned from the start. |
| 2026-10-12 | **S1b built:** worlds kept in `worlds/<id>/` (`server/storage/worlds.js`): `world.json` with formatVersion and the world's settings (a schema each, as the server's have), each save moving the last five down a ring before the new one's written whole, a latest that won't read passed over for the newest that will (the journal says which), and refused only if none reads; the heroes a world keeps, six for each player (`heroes.js`, at the browser's `SAVE_VERSION`); and `server/keeper.js`, saving a running world on each war turn and whenever it's asked. | S1's proof: a world saved, the process started again, restored with the same checksum, and the same 200 steps later (`test/world-store.test.js`). |
| 2026-10-12 | **S1c built, and S1 with it:** `Host.forward` brings a snapshot kept by an older version forward a step at a time (`SNAPSHOT_STEPS`, from 26), and `Host.restore` uses it; a fixture of each version from 26 (`npm run snapshot-fixture`) is brought forward and played on by `test/snapshots.test.js`. `server/reopen.js`: a kept world opened (refused, naming the server it needs, if a newer version kept it), started afresh from its seed if it can't be carried on (a copy made first, its war and kept heroes kept), and a player's solo world brought in (`app/save.js` exportCharacter, read back through importCharacter as the game reads its own). contribution.md's rule for `SNAPSHOT_VERSION` says so. | §5.1's last pieces for S1. The step from 26 fills in the world's rules and each player's role, last command and away state, as S0b added them. |
| 2026-10-12 | **S2a built:** `server/access/`: long keys, short codes, return tickets and sessions (`tokens.js`, `sessions.js`), the server's secrets (`secrets.js`: the admin key made at the first start and shown once, creator keys) and each world's keys, codes, players and bans (`world.js`, `access.json`), the access hooks (`policy.js` KeyPolicy: identify, allows, on, admits) over them (`index.js`), the limits (`limits.js`), home addresses (`addresses.js`) and the server's identity (`identity.js`). Settled while building: a key's first four characters name it (26 left for the secret's 130 bits); world keys are sealed as well as hashed, so the owner can show one again; short codes are hashed with the server's own salt and their wrong guesses counted across the server; a ticket alone works while the key its player last came by does; the server's `hi` carries its public key. contribution.md's version rules gained `FORMAT_VERSION`, `SECRETS_VERSION` and `ACCESS_VERSION`. | §7 as the plan had it couldn't be built as written in places: a hashed key can't be shown again as a QR code, a wrong short code says nothing of which code or world it was for, and a fingerprint alone can't check a signature. |
| 2026-10-13 | **S2b built:** each running world in a thread of its own (`server/world-worker.js`, `world-thread.js`): made from its seed and carried on from its save, its clock running only while someone's present (their link up and their game loaded: the new `ready` message), stopped and saved in the step the last one goes, and stopped while every present player's page is hidden (the new `away` message) or, if the world says so, while someone's loading. In a kept world a player's hero comes from the disk: one of theirs by its slot, or a new one from the character maker's looks alone, playing as `<player>.<slot>`; a server stopped with players in puts them back in their slots from the world's last save. `server/registry.js` runs `worldsAtOnce` at once (the next waits its turn), sets aside a world empty for `setAsideMinutes` (its thread ended and its memory given back), keeps the machine awake while anyone's present (`server/platform/` keepAwake: caffeinate on macOS, a systemd inhibitor on Linux) and recommends a most (half the memory at §17's 250 MB a world, and the cores less one). `Host.join` takes where a player was and as they were (`place`, `vitals`), recorded with their join so every copy does the same, and `Host.placeOf` says where to come back to; `NET_VERSION` 113. | S2's worlds, before the port that lets players reach them (S2c). Measured: a world opens in a thread in 3.3 s here, takes about 110 MB, and gives it back when its thread ends. |
| 2026-10-13 | **S2c built, and S2 with it:** the one port (`server/world-server.js`): the game's files, `/api/v1` (`api.js`: status, health, enter, codes/redeem, worlds, a world's keys and codes) and the play socket (`play.js`: `hi`, `enter`, `reenter`, `data`, `waiting`, `closed`), each behind the guards (`guards.js`: home addresses only until TLS, the server's own Host names, an exact list of Origins, blocked addresses, 64 KB bodies, nothing in query strings). A world someone's let into is held for them (`ARRIVAL`, 15 s) so it isn't set aside before they arrive; a world's thread writes its `world.json`, and the supervisor reads it again once the thread's ended. `npm run world-server` prints the addresses, the id and, the first time, the admin key. `test/world-server.test.js` is §15's proof over real sockets, with the socket fuzzed. The server's tests run in `npm test`, so no new CI job. | §15's S2. Where §12 changed: `/enter`'s too-many-worlds is a wait, not a refusal; `hello` gains `hero`, not `ticket` (the session says who); `Authorization: Key` for the admin and creator keys. |
| 2026-10-13 | **S3 built:** the game's side of world servers. `client/js/core/identity.js` checks a server's `hi` proof as the server makes it (the same fingerprint), always with noble-ed25519 and noble-hashes bundled small into `client/vendor/` (`npm run vendor:ed25519`), as a game opened from a server on the Wi-Fi is a plain-http page without WebCrypto. `client/js/app/servers.js`: addresses as typed, invite links (the server, its id, the world and a key or code in the fragment, cleared from the address bar once read), the servers known (`pellagos.servers`, with each world's key and ticket, exported and imported as a code), and `ServerClient`: the server's card, its proof before anything secret's sent (pinned the first time, or to an invite's id; a different id stops everything), `/enter`, `/codes/redeem`, worlds made, keys and short codes, and the play socket. `RelayLink` speaks the play socket too. The title's **Worlds on servers**: servers with their status (another version greyed, with the server's own page offered; a server at home unreachable from an https page said so), worlds listed and held, a code, a key, a world made, servers and tickets carried; a kept world's heroes chosen among, or a new one (brought in whole on a first visit where the world allows). In a world that keeps heroes the game's hero is the world's, and nothing of it's saved on the device. The game tells the world it's `ready` once it's loaded, and `away` while its page is hidden. The in-game **World** panel: who's here, invite links and short codes, the world's keys (revoked there), leaving. `/enter` answers with the world's card. `e2e/worlds.spec.js` is §15's proof. | §15's S3. Switching a world's heroes mode moved to S4, with the world's other settings. The game always uses the vendored verifier, not WebCrypto where there is one: one way of checking, the same everywhere. |
| 2026-10-13 | **S4 built:** the management page, `client/admin.html` with `client/js/admin/page.js` and `admin.css` (the game's colours and type), served on the server's computer by its own listener on loopback (`server/admin.js`, the new `adminPort` setting, 8481), needing no key, each call carrying the page's cookie (SameSite=Strict) and the `x-pellagos` header, its own two names alone and its own origin alone; and from the Wi-Fi at `/admin` on the play port, the admin key traded for a session (`POST /server/session`). What owners and the admin can do is `server/manage.js`: a world's details and state in words with its day and hour (the world's `elapsed` now kept in `world.json` and reported by its thread), its settings changed (`PATCH /worlds/:id`: its heroes mode and first-hero rule while it's set aside, the rest at once, its thread told so its copy of `world.json` keeps them), started, set aside (everyone sent out, `set-aside`), saved, deleted with its name typed (`world-deleted`, a last backup kept in `backups/<id>/`); its players sent out, banned and unbanned, given another part or a new ticket (an invite link can carry a ticket now); its backups: the autosaves, and the ladder made as it's saved (one an hour, the last 12; one a day, the last 7), by hand (a running world saves, then copies itself in its own thread, never mid-write), restored (set aside and backed up first; its keys, players and journal kept as they are) and downloaded; exported as one gzipped file (`pellagos.world.1`: `world.json`, the latest snapshot, its kept heroes; nothing of who may come in). The server's settings, creator keys, a new admin key and stopping (these two on the computer alone), its own journal (`journal.log`) with every world's, health, and the recommended worlds at once now as §10 has it (what's kept back, the largest world seen, the cores). QR codes from qrcode-generator 2.0.4 (MIT), vendored small (`npm run vendor:qrcode`). The address and invite helpers moved to `client/js/app/invites.js` so the page needn't load the game's netcode. `test/admin.test.js` and `e2e/admin.spec.js` are §15's proof. | §15's S4. Three things came early, as the page's sections needed them: the backup ladder, exporting, and the journal (from S9), and the QR codes (from S5). Importing and updating stay with S9. The plan's same-site cookie is the Mac listener's alone: from the Wi-Fi the session goes in a header, which no other site's page can send. |
| 2026-10-13 | **S6a built:** TLS on the one port. `server/world-server.js` listens with a plain TCP listener that hands each connection, by its first byte, to an https half (its certificate set with `setSecureContext`, TLS 1.2 or later, a handshake given 5 s) or a plain http half, both answering alike; told they're listening so their own time limits run (checked every second); every connection closed with the port. Certificates: `server/net/der.js` (DER, written and read), `server/net/x509.js` (ECDSA P-256 keys, certificate requests, certificates signed by another key or their own, TLS-ALPN-01's acmeIdentifier, a certificate described), `server/storage/certificates.js` (kept, checked, `0600`). The `internet` setting (off at first); `guard()` returns where a request is from (`home` or `internet`; the tests make loopback the internet with the `home` option) and takes TLS into account: the internet refused while it's closed (no setting, or no certificate), and over TLS alone once it's open (`secure`; page loads sent on with 308). `api.js` and `play.js` carry where each is from to the access hooks, so the admin key is never taken from the internet; `/admin` is refused there too. Secure addresses (`https://name:port`, one per name the certificate carries) are listed in `/status` once the internet's answered, said in Terminal, and on the management page with the certificate's facts; an owner's own certificate is put in from the page (`PUT /server/certificate`) or its files. The game words `secure` and `internet-closed`. `test/x509.test.js`, `test/tls.test.js` and `e2e/secure.spec.js` are §15's proof so far. | §15's S6, its first part. The owner's own certificate wasn't one of §9.2's routes: it's the plainest way to the internet for an owner who already has one, and it's how the server's TLS is proved before ACME (S6b) gets certificates for it. |
| 2026-10-13 | **S5 built:** nearby servers on the Wi-Fi. Bonjour in the platform layer: `server/platform/bonjour.js` (the service, the TXT record and its percent-encoded values, the refusals named for the owner, a tool's handle read a line at a time), `dns-sd -R/-B/-L` on macOS (`darwin.js`, with the computer's own name from `scutil`), `avahi-publish-service` and `avahi-browse -rpk` on Linux (`linux.js`), and a refusal on Windows. `server/nearby.js`: advertised under the server's name, advertised again when its TXT changes (at most every 10 s, looked at every 30 s), the others resolved (their IPv4 address looked up) and listed in `/status`'s `nearby`, never itself, lost when they go; refused or stopped, said and tried again a minute later; on and off with the `bonjour` setting. The status card carries the server's name. The guards let a nearby server's pages use the play routes, by exact address. The game's Worlds screen lists the servers a known one finds, "Nearby", added with a tap; the management page's overview says whether it's shown on the Wi-Fi (or why not) and lists the servers near it; `npm run world-server` says so in Terminal. `test/nearby.test.js` (a fake responder: `test/fake-bonjour.js`) and `e2e/nearby.spec.js` are §15's proof. | §15's S5. The nearby servers' origins weren't in the plan: without them, the game from one server's page couldn't use another's, though it found it. The manual check on two Macs needs macOS, so it's the owner's. |
| 2026-10-13 | **S6b built:** free certificates. `server/net/acme.js` (RFC 8555 on `node:crypto`: ES256 JWS with jwk then kid, nonces and one retry of a stale one, POST-as-GET, orders with a profile and `replaces`, renewal information by RFC 9773's certificate id, TLS-ALPN-01's reverse names), `server/net/dns-hosts.js` (DuckDNS, Cloudflare and deSEC, each by its own API; a record waited for at its zone's own nameservers), `server/certify.js` (the three routes, the account key, `acme.json` without the token, renewal by the CA's window else a third of the life left, retries after 1, 6 and 24 hours, a DuckDNS name pointed home every 5 minutes), TLS-ALPN-01 answered on the one port (`answerChallenge`: SNI and ALPN callbacks on the https half), tokens in the Keychain through `security -i` on its standard input or `certificates/tokens.json`; x509.js's certificates name their key and their issuer's (subject and authority key identifiers), as a renewal's id needs. The API (`GET`, `POST`, `DELETE /server/certificate/acme`, `POST …/renew`), the page's form and how it goes, and Terminal's lines. The page's overview no longer refreshes over an open form. `test/fake-acme.js` is the CA the tests use, `test/acme.test.js` and a third case in `e2e/secure.spec.js` the proof. And the field battle's two crowd tests wait for a sort of the soldiers after everything's drawn: they could look in the half second before it and see more drawn in full than the margin (seen on CI, #372). | §15's S6, its second part. §9.2 had renewal "30 days before expiry" and "every 3 days": Let's Encrypt now says when (renewal information), and a third of the life left is the fallback. DuckDNS's place on the Public Suffix List was checked (§16). Pebble, named in §15, is a Go program: a CA in the tests' own JavaScript runs everywhere `npm test` does, checking the same things. |
| 2026-10-13 | **S6c built:** the router asked to let the internet in. `server/net/udp.js` (a UDP question asked again, 250 ms doubling, answered only from where it was asked; addresses as 16 bytes), `pcp.js` (MAP, its nonce kept; a NAT-PMP router answering told apart), `natpmp.js`, `upnp.js` (SSDP, the description's services, SOAP: AddPortMapping, AddAnyPortMapping on IGD v2, DeletePortMapping, GetExternalIPAddress, the IPv6 firewall's AddPinhole, UpdatePinhole and DeletePinhole), `stun.js` (binding requests, XOR-MAPPED-ADDRESS); `server/router.js` (the order, the mappings and their renewal, the pinhole, the checks, the words); the platform layer's `gateways()`; the world server's second port, its hairpin check, and the `router` setting; the page's **The router** and `POST /server/router`. `test/fake-router.js` and `test/router.test.js`, and a fourth case in `e2e/secure.spec.js`, are the proof. | §15's S6, its third part. Found while building: PCP and NAT-PMP forward one outside port to each inside one, so the IP certificate's 443 can't share the play port's mapping; a second listener takes it. |
| 2026-10-13 | **S6d built:** the page's internet setup and Tailscale Funnel. The internet panel: **Open to the internet** / **Close to the internet**, then **A way in** (free certificates, one of the owner's own, **Tailscale Funnel**), the router, and **Tested from outside**. `server/funnel.js` (Tailscale's `status`, `serve status`, `funnel --bg --https=443 --yes`, `funnel --https=443 off`; never taking over the owner's own Funnel; the link to allow it), Tailscale's command in the platform layer, the tunnel listener on `127.0.0.1` (`funnel` and `tunnelPort` settings), the guards' tunnel (the internet's, from X-Forwarded-For's last address, by Funnel's name), `/status`'s internet addresses and `you`, `POST /reachability` and `POST /server/funnel`. `test/fake-tailscale.js`, `test/funnel.test.js` and a fifth case in `e2e/secure.spec.js` are the proof. | §15's S6, its fourth part. S6d was split: the game's side (Test this server's button, home-and-away addresses, typed addresses, the Pages hand-off) is S6e, so each PR stays one side. |
| 2026-10-13 | **S6e built:** the game's side of reaching a server. `app/servers.js`: `homeHost`, `addressesOf` (a card's addresses, as the server says them), `candidatesOf` (the order they're tried in), `ServerClient.reach` (the first whose card answers, another server's passed over), `status` keeping the addresses, `you.home` and where it answered, and `test` (Test this server, reported to the server). The Worlds screen's **Test this server**, `#test` from the management page's code, bare addresses tried secure first, and the hand-off link from an https page. `test/servers.test.js`'s new cases and `e2e/reach.spec.js` are the proof. | §15's S6, its fifth and last part. |
| 2026-10-13 | **S7 built:** the broker and players' own worlds. `server/broker.js` (`/broker`, the `broker` and `relaying` settings, 3 listings per address and 100 in all, 50 signals an attempt, 15 joiners a world), the status card's `players` and `server.broker`; `app/peer.js` (`BrokerHost`, `BrokerJoin`, 16 KB pieces, back-pressure, relay fallback after 10 s, ICE restart, the reachability check), `openWorld`/`joinWorld` through a broker, Invite others through the server the game came from (or a known one), **List it on**, `?join=CODE&at=`, and the Worlds screen's players' worlds. `test/broker.test.js`, `test/peer.test.js` (with `test/fake-rtc.js`) and `e2e/broker.spec.js` are the proof. | §15's S7. Listings carry `local` as well as `direct`, so a world reachable on its own network is listed to those on it when the server doesn't relay; a keep can list or unlist a world without a new code. The world listed on several servers at once, and the server's own STUN responder, are left for later. |
| 2026-10-13 | **S8 built:** the Mac app. `server/world.js --app` (how it stands on `@pellagos` lines; stopped, every world saved, by SIGTERM or its input closing); the menu-bar app in SwiftUI (`mac/`: `ServerProcess.swift` runs the server and reads its lines, `LoginItem.swift` registers the bundle's agent with `SMAppService`); `scripts/build-mac-app.js` (`npm run build:mac`: Info.plist and the agent's plist, Node 24.21.0 arm64 checked against `SHASUMS256.txt` and a hash kept, the server and the game, ad-hoc signing, the zip, the source archive and the Homebrew formula); `.github/workflows/mac.yml`; docs/MAC_APP.md (Open Anyway, the prompts, the menu, the tap, the owner's checks). `test/world-app.test.js`, `test/mac-app.test.js` and the workflow are the proof. | §15's S8. The agent runs the app, not the server alone, so the menu and the server it runs are one, and Quit is Quit. Node inside keeps its own Developer ID signature rather than being signed ad hoc with the app. The tap and releases are published by hand: the workflow makes them and publishes nothing. |
| 2026-10-13 | **S9 built:** running it for real. Importing: `POST /worlds/import` (the export's bytes as they are, gzipped or not, 64 MB at most; its format, a world from a newer server refused, saying so; made a new world with keys of its own and a journal line), the page's **Or bring a world in**. Updating: `server/update/releases.js` (GitHub's releases, `server-v<version>`, the archive and its `.sig`, 256 MB at most, Ed25519 against `server/update/release-key.pem`), `installed.js` (how the server was installed, `versions/<version>/`, `current.json`, `last.json`, unpacking a release, rolling back), `updater.js` (a check a minute after starting and once a day while `checkUpdates` is on; refused while players are in; download, check, set every world aside and back it up, back up the server's own files, unpack, restart), `server/launch.js` behind `server/world.js` (the newer of its own and the installed version, run as `server/serve.js`; kept once it's said it's running, rolled back if it ends or says nothing for 3 minutes, `PELLAGOS_TRYING`, exit code 75), `server/reopen.js` `bringForward`; `GET`, `POST /server/update`; the page's **Updates**; the menu-bar app's **Updating**; `npm run release-key` (`--new`, `--sign`, `--verify`) and the Mac workflow signing with `PELLAGOS_RELEASE_KEY`. The soak: `scripts/server-soak.js` (`npm run soak:server`), judged in `test/server-soak.test.js`. What it found, fixed: field battles let go once they're done (`FIELD_BATTLE.linger` 20 s, `lasts` 5 minutes; the host's `fields` in its snapshot, `SNAPSHOT_VERSION` 28 with its step and fixture; `NET_VERSION` 118, as #381's to #384's creatures took 114 to 117); every open building's floors keep their meshes (`AHEAD.spare`); the soak's players at nice 10. The world's health now carries its battle's head-count, its thread's CPU time and what's made ahead. `docs/SERVER.md`; contribution.md's rows and its launcher contract; README's "Playing together". | §15's S9: the 2-hour soak passed (136 MB an hour in, 130 at the end; the worst minute's p99 30.4 ms), the update migrated every fixture world and a forced failure rolled back. An update is refused while players are in, rather than waiting for them to go: the owner sets their worlds aside, which says so to them. The soak's players run at a lower priority than the server, as they'd be on devices of their own; its steps are timed by the clock, as the budget is, with the thread's CPU beside them. Three soaks before the passing one were stopped part way, each on a finding above. |
| 2026-10-13 | **The Mac installer:** `scripts/install-mac.sh`, one line in Terminal (`curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh \| bash`): the newest server release's app (picked as `releases.js` picks it; its zip checked against the SHA-256 GitHub keeps for it), `--zip` for one at hand, `--build` to build it on the Mac from the source (Apple's Command Line Tools; Node 22 or later, or the one `build-mac-app.js` pins, fetched and checked), `--uninstall`. The app checked (its bundle id, `codesign --verify`) before it's put in place; a running one stopped as Quit stops it (its server first, every world saved, then the app, its launch agent let go of); never `sudo` (`/Applications`, or `~/Applications`). `test/install-mac.test.js` runs it with stand-ins for the Mac's tools; the Mac workflow runs it for real, each way. docs/MAC_APP.md's "Installing it". | Asked for by the owner: an installer and instructions for macOS. Downloaded by the installer rather than a browser, the app isn't marked as downloaded, so it opens without Open Anyway (which an ad-hoc signature otherwise needs, as there's no Developer ID); a zip given to it has the mark taken off once it's checked. A script, not a `.pkg`: an installer package unsigned by a Developer ID is held back by Gatekeeper just as the app is. Before there's a release, `--build` is the way in. |
| 2026-10-16 | **Archives:** the whole server as one file (`server/storage/archive.js`, `pellagos.archive.1`: the data folder's files but its backups, the versions updates installed and a DNS host's token), made from Settings › Archive (every world going saved first) or `--archive` (stopped); restored in place of everything on a server with no worlds (staged, then put in place as the data folder opens, what was there backed up; brought forward by the folder's own steps), or its worlds brought in as new ones (`importBundle`). A world whose save is older than any step goes back to isn't refused but started afresh from its seed, its war and heroes kept (`freshStart`, now also **Start it afresh** in a world's Backups tab), and said so. Steps are never taken away (`test/snapshots.test.js`). | Asked for by the owner: archive hosted worlds when the server's taken off, and bring them, however old, into the newest server. An archive keeps who may come in, so a restored server is the same server to its players. |
| 2026-10-16 | **Uninstall:** the menu-bar app's **Uninstall…** (`mac/Sources/PellagosServer/Uninstall.swift`) and the installer's `--uninstall` take everything Pellagos Server keeps off the Mac: the app, its login item, its data folder, logs, caches, preferences and Keychain entries. First they ask whether every world's to be saved to an archive in Documents (in Terminal even piped from curl; with nobody to ask, it is), made by the app's own server (`server/world.js --archive`) once it's stopped; if it can't be, nothing's taken away. `--archive`, `--no-archive` and `--archive-to` answer it beforehand; `--keep-data` takes the app alone. The app carries the installer (`Contents/Resources/install-mac.sh`) and runs it on its own (`--from-app`): it stops the app and says how it went in a dialog, the archive shown in the Finder. The Mac workflow takes it away both ways, a world archived and read back. | Asked for by the owner: uninstall from the menu and from Terminal, offering to archive every world first. |
| 2026-10-16 | **Heroes as files:** a world's kept heroes leave it and come into it as the game's character files (`client/js/app/character-file.js`, `pellagos.character.1`: `exportOfKept`, `keptOfExport`). A player takes one of theirs home from the hero chooser (**Take one home**: `GET /worlds/:id/heroes/:slot` on their session, `manage.heroesFile`), a copy kept on their device in the world's land and with its war as last saved. Where a first hero may be brought in, they bring one from a file (**Bring one from a file**, told first what was changed). The owner exports a player's heroes from the Players tab (**Export heroes**: `GET /worlds/:id/players/:player/heroes`). A kept hero, or one brought in, comes into the world as this version plays them (`salvageKept`), the world's journal told what was left out or put right. | Asked for by the owner: characters archived and brought back as worlds are, however old. Taken home, the hero stays in the world: a copy goes home, so nothing's lost either way. |
