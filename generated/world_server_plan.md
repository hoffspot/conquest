# The world server: the plan

A plan, being built: S0 and S1 are done, and S2 is next ([§15](#15-milestones)). It is a living
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
- **Flushing.** `hosting.flush()` every 100 ms.
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
  only). It keeps the announcement alive every 15 s, and it disappears after 45 s of silence.
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
plain HTTP/WS.

| From | Plain `http`/`ws` | TLS `https`/`wss` |
|---|---|---|
| **A home address:** private IPv4 (`10/8`, `172.16/12`, `192.168/16`), link-local, IPv6 unique-local (`fc00::/7`) or link-local | Accepted | Accepted |
| **The internet:** every other address, including the CGNAT range `100.64/10` | **Refused.** A page load is redirected to `https://`. A socket is closed with "Use the server's secure address". | Accepted, if a certificate is set up. Without one the server doesn't answer the internet at all, and the page says opening to the internet isn't finished. |

**Two more listeners on loopback only**, never reachable from outside:
- `127.0.0.1:8481` for the management page on the Mac ([§7.3](#73-the-owner-and-claiming-the-server));
- `127.0.0.1:8482` for a tunnel ([§9.4](#94-behind-cgnat)). Everything arriving there is treated
  as internet traffic, because a tunnel delivers it from `localhost`.

**What a player types, and what happens:**

| Typed | Game opened from | What happens |
|---|---|---|
| `pellagos-sam.duckdns.org:8480` | anywhere | `wss://`, with the name's certificate. Works in every browser, anywhere. |
| `203.0.113.7:8480` or `[2001:db8::7]:8480` | anywhere | `wss://`, with an IP certificate ([§9.2](#92-free-certificates)) |
| `studio-mac.local:8480` or `192.168.1.20:8480` | the server's own page | `ws://`, no prompt |
| the same | GitHub Pages | Chrome and Firefox: `ws://` after their prompt. Safari: a hand-off to the server's own page ([§9.5](#95-from-the-github-pages-copy)). |

**Home and away under one name.** The server's status lists all its addresses. The game remembers
them with the server's id ([§7.6](#76-the-servers-identity)) and tries the home address first when
the public address matches its own, then the internet address. So a laptop that moves between home
and a café keeps working. It also gets round routers that can't loop a public name back inside
(no "hairpin NAT").

### 9.2 Free certificates

The server carries an ACME client (RFC 8555, on `node:crypto`, no native add-ons). It keeps the
account key and certificates in `certificates/` (`0600`) and renews them itself. Setup offers three
routes, in this order:

| Route | Players type | How it's proved | Renewal | Trade-offs |
|---|---|---|---|---|
| **1. A free DuckDNS name** (suggested first) | `pellagos-sam.duckdns.org:8480` | DNS-01: the server sets `_acme-challenge` through DuckDNS's `&txt=` API. Works on any port. | 30 days before expiry. Let's Encrypt lifetimes are shrinking from 90 to 45 days over the next few years, and the client follows. | Needs a free DuckDNS account and token. The server also keeps the name pointed at the home's address, checking every 5 minutes, so links survive IP changes. **Unknown:** whether `duckdns.org` is on the Public Suffix List. If it isn't, all DuckDNS users share Let's Encrypt's 50 certificates a week, and route 2 or 3 is the fallback. |
| **2. The owner's own domain** | `pellagos.example.com:8480` | DNS-01 through the domain's DNS host's API (a token the owner pastes in) | As route 1 | For owners who already have a domain. Nothing is bought for this. |
| **3. The IP address** | `203.0.113.7:8480` or `[2001:db8::7]:8480` | TLS-ALPN-01 on port 443 (or HTTP-01 on 80). The router maps external 443 to 8480, and the server answers the `acme-tls/1` challenge on its own port. | The "shortlived" profile (160 hours), renewed every 3 days | No account at all. But the certificate, and every shared link, breaks when the home's IP changes. The server re-issues automatically for the new IP, and the page warns that links must be re-shared. |

**Not offered:**
- plain `ws://` from the internet;
- self-signed certificates, which browsers warn about and iPhones refuse without a profile;
- Cloudflare quick tunnels, ngrok and playit.gg: random names, warning pages or paid HTTPS.

**Later: WebTransport** with `serverCertificateHashes` (Baseline 2026, Safari 26.4) would let a page
reach a self-signed server by its certificate's hash. It needs an HTTP/3 server, which Node doesn't
yet offer in a stable form. Revisit when it does.

### 9.3 Opening the router

- **Asking the router.** When the owner turns on **Open to the internet**, the server asks the
  router for a mapping. It tries, in order:
  - PCP (RFC 6887);
  - NAT-PMP (RFC 6886: UDP 5351, a 2-hour lifetime renewed at half-life; it's in Apple's own
    routers);
  - UPnP-IGD.

  It maps TCP 8480, plus 443 for an IP certificate.
- **IPv6.** Addresses need no mapping, but home routers firewall inbound IPv6. The server asks for
  a pinhole through PCP or UPnP-IGD v2's IPv6 firewall control where the router offers it.
- **While running.** Mappings are renewed, and removed when the owner turns internet access off or
  the server stops. **Close to the internet** is one switch on the page: the mapping goes, and
  internet connections are refused from that moment.
- **macOS permission.** Talking to the router counts as reaching the local network. A Terminal
  launch is exempt; the Phase 2 app needs macOS's Local Network permission ([§11](#11-on-the-mac)).
- **When the router won't.** The page shows manual steps: the router's admin address (the
  gateway), the Mac's LAN address, and the ports to forward.
- **Proving it works.**
  - **Public address.** From the router's answer, and a STUN request to `stun.cloudflare.com` or
    `stun.l.google.com`. These are free, with no service promise.
  - **CGNAT.** Spotted when the router's external address falls in `100.64.0.0/10` or differs from
    the STUN answer ([§9.4](#94-behind-cgnat)).
  - **Hairpin check.** The server tries its own public address through the router. Success proves
    the port is open; failure proves nothing, as many routers don't hairpin.
  - **Free extra proof.** A Let's Encrypt IP certificate can only be issued if the port is reachable.
  - **From outside.** The definitive test is the game's **"Test this server"** button on any device
    on another network (a phone on cellular), which reports back to the server's page.

### 9.4 Behind CGNAT

When the internet provider shares one public address between many homes, no router setting can
open a port. The page says so plainly: "Your internet provider shares one address between many
homes, so nobody can reach this Mac directly from the internet." It then offers two ways on:

1. **Tailscale Funnel**, free.
   - **Setup.** The owner installs Tailscale (on macOS, the open-source client) and allows Funnel.
     The server runs `tailscale funnel --bg 8482`.
   - **The address.** Players reach `https://studio-mac.<tailnet>.ts.net`, a stable name with
     Tailscale's own certificate, on port 443, 8443 or 10000.
   - **How it's treated.** Traffic arrives on the tunnel listener, `127.0.0.1:8482`, which the server
     treats exactly as internet traffic: keys required, no management.
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
links. It tries `wss://` first, then `ws://` where the browser and address allow it, then offers the
server's own page. It sends nothing secret until the server has proved its identity
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

**Updating** (both phases). The owner clicks; nothing updates itself.
1. Once a day the server checks the project's GitHub releases (free; can be turned off). The page
   then shows "Version 2.4.0 is out", with its notes.
2. **Update** downloads the release archive and checks it against the release's signature: an
   Ed25519 key belonging to the project, whose public half ships with the server. Free, and no Apple
   signing involved.
3. It waits until no players are in, or the owner tells players and sets worlds aside.
4. It backs up every world and the settings ([§5.1](#51-settings-versions-and-upgrades)).
5. It unpacks the new version beside the old one, and restarts into it. Migrations run on first
   start.
6. If the new version fails to start or migrate, the server goes back to the old version and the
   backups, and says why. The previous version stays until the next update.

A server run from a git checkout shows the commands to update instead.

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
| `GET /status` | nothing (rate-limited) | The server's card and addresses, its listed worlds with player counts and hero names, nearby servers, listed players' worlds, and versions ([§8.1](#81-servers-the-player-knows)) |
| `GET /health` | nothing | `ok` or `slow` |
| `POST /enter` `{world, key?, ticket?}` | a key or ticket | `{session, ticket?, role, world, heroes}`, where `heroes` lists the player's kept heroes in kept worlds (up to 6). Refusals say why: `no-world`, `key`, `banned`, `full`, `busy` (too many worlds running), `locked`, `version`, `wait n` |
| `POST /codes/redeem` `{code}` | a short code | Trades it, once, for `{world, key}`, then as `/enter` |
| `GET /worlds` | a session or the admin key | Listed worlds, plus unlisted worlds the caller holds keys for |
| `POST /worlds` | a creator key or the admin key | Make a world (unlisted). Returns `{world, ownerKey, playerKey}` |
| `PATCH /worlds/:id`, `DELETE /worlds/:id {confirm}` | owner | Change settings, or delete (with the world's name typed) |
| `POST /worlds/:id/start`, `/aside`, `/save` | owner | Lifecycle |
| `GET`, `POST`, `DELETE` `/worlds/:id/keys[/:key]`; `POST …/keys/:key/replace`; `POST …/codes` | owner, or trusted if the world allows | Keys and short codes |
| `GET /worlds/:id/players`; `POST …/players/:p/kick`, `/ban`, `/unban`, `/role`, `/ticket` | owner | Players, including reissuing a lost ticket |
| `GET`, `POST` `/worlds/:id/backups`; `POST …/backups/:b/restore`; `GET …/export`; `POST /worlds/import` | owner (import: `world.create`) | Backups and moving worlds |
| `GET`, `PATCH` `/server`; `GET /server/journal`, `/server/health`; `GET`, `POST`, `DELETE` `/server/creators`; `POST /server/update` | admin, from the Mac or the home network only | Settings, health, creator keys and updating |

- **Authorisation.** `Authorization: Bearer <session>`.
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
- **`hello` gains fields:** `ticket`, and `hero` (which of the player's kept heroes, or `new`). In
  kept worlds the hero comes from the server, and the client's `character` is ignored unless the
  world allows bringing one in on the first visit.
- **AFK lives in the rules.** Each player's last-command step is part of the host's state, so every
  replica shows the AFK icon at the same step. The 30-minute kick is a recorded leave op, so replay
  stays exact.
- **`NET_VERSION` bumps** with these changes.
- **Limits.** Joins are throttled: at most 2 welcomes (full snapshots) sent at once, as Factorio's
  `max_upload_slots` does.

### 12.3 WebSocket `/broker` (subprotocol `pellagos.broker.1`)

| Message | From | Does |
|---|---|---|
| `announce {name, people, players, most, net, visibility, direct}` → `announced ID TOKEN` | a browser host | List their world; `direct` is the result of the reachability check |
| `keep ID TOKEN` | a browser host | Keep the announcement alive every 15 s; it expires after 45 s |
| `withdraw ID` | a browser host | Take it down |
| `watch` → `seen [...]`, then `+ {…}` and `- ID` | anyone | Follow the list of players' worlds |
| `connect ID` → `peer pN` | a joiner | Start a connection |
| `signal pN {sdp or candidate}` | either side | Passed on as is (the broker reads only the target) |
| `relay pN` and then today's relay verbs | either side | Fall back to relaying through the server |

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
  wildcards and `null` refused. Allowed: the server's own origins, `https://hoffspot.github.io`, and
  any origins the owner adds. This stops cross-site WebSocket hijacking; it doesn't stop bots, which
  is what keys are for.
- **Guarding against DNS rebinding** on every listener. Requests whose `Host` isn't one of the
  server's own names or addresses are refused.
- **Guarding against cross-site requests.** Management calls also need a custom header and a
  same-site cookie, so another website open on the Mac can't drive them.
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
  Keychain through `/usr/bin/security`) where there is one, otherwise in `secrets.json`.

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

| # | Milestone | Proven by |
|---|---|---|
| **S0** | **The runner and host-free worlds.** `core/runner.js` takes the glue out of `game.js`, and the browser game uses it. Worlds with no `HOST_PLAYER` get their rules: resting passes time when everyone present rests; debug is owner-only. AFK goes into the rules: the last-command step, the icon over the head at 10 minutes, the kick at 30. Baking happens ahead in workers on Node. Plus the cross-engine soak. | Existing e2e unchanged. New: a Node runner with a Node joiner for 10 min with no resyncs. The soak: under 1 resync per player-hour in Chromium, WebKit and Firefox. No step over 50 ms in the 4-town run. AFK icon and kick at the same step on every replica. |
| **S1** | **The whole world saved, and versions.** Snapshot save and load via the runner, gzip, atomic writes, the heroes store (up to 6 per player). The version framework of [§5.1](#51-settings-versions-and-upgrades): the data folder, settings with schemas, the `SNAPSHOT_VERSION` migration chain with fixtures, refusing newer data. The "fresh start from the seed" fallback, and the solo-world import. | Save, restart the process, restore: identical checksum. Every fixture loads. A corrupt file falls back to an autosave. An older server refuses a newer folder, with the version it needs. |
| **S2** | **The server on the Wi-Fi.** The supervisor, world workers, the registry and the lifecycle of [§4](#4-a-worlds-life-and-its-time), with 2 worlds at once and the recommended maximum. The platform layer, macOS first. The one port, plain at home only. `/api/v1` (status, enter, worlds, create), `/play` and the server's identity. Keys, short codes, tickets, sessions, creator keys and the access policy. Limits, temporary blocks and bans. Keeping the Mac awake. `npm run world-server`. | Node clients over real sockets: make a world, enter with a key, leave (frozen: the war's clock identical), come back (same hero, same place), revoke the key (closed `key-revoked`). A short code redeems once. A third world waits while two run. Ending a worker frees its memory. Fuzz the socket. The whole server suite also runs on Linux in CI. |
| **S3** | **The game's Worlds screen.** Known servers, adding a server by address, status with listed worlds, entering keys and short codes, making a world. Heroes kept (choosing among up to 6, the first-hero rule, mode switching) or brought in. Identity pinning, invite links with the server in them, version mismatch handling. Exporting and importing "my servers and tickets". The in-game World panel: who's here, keys, leave. | e2e against a local world server: two browser contexts, one makes a world and shares the key; the other enters, plays and leaves; the world freezes; the second comes back to its hero. A changed server identity stops the game sending its key. |
| **S4** | **The management page.** Every section of [§10](#10-the-servers-management-page), the Mac-only listener, the admin key from home addresses (and never from the internet), DNS-rebinding and CSRF guards. | e2e of the page: make, set aside, back up, restore, delete, reissue a ticket. Tests that a foreign `Host` or `Origin`, and the admin key from a public address, are refused. |
| **S5** | **Nearby Macs.** Bonjour advertising and browsing, `nearby` in status, the page's addresses and QR codes, clean failure when macOS refuses. | Unit tests with a fake responder. A manual check on two Macs on macOS 27.0.1. |
| **S6** | **The open internet port.** TLS on the one port, refusing plain connections from the internet. The ACME client: a DuckDNS name (suggested first), the owner's own domain, or the IP. Router mapping (PCP, NAT-PMP, UPnP) and IPv6 pinholes. The CGNAT check and the Tailscale Funnel helper with the tunnel listener. "Test this server", "Close to the internet", home-and-away addresses, and the GitHub Pages hand-off ([§9](#9-reaching-the-server)). | Unit tests against a fake router and a fake ACME server (Pebble). Plain `ws://` from a public address is refused. A manual check from a phone on cellular, in Safari and Chrome, by DuckDNS name and by IP. |
| **S7** | **The broker and players' worlds.** Presence, signalling, the WebRTC `Link` for browser-hosted worlds, the reachability check, the listing rule (direct, or "through the server" when relaying is allowed, or hidden), relay fallback, and the game's "Players" list. Today's `/relay` kept for one release, then removed. | e2e: two browser contexts on loopback connect over WebRTC through the broker. Forcing ICE to fail falls back to relaying, or hides the world when relaying is off. Announcement expiry. |
| **S8** | **The Mac app.** The menu-bar wrapper, bundled Node, the `SMAppService` agent, plist keys, ad-hoc signing, the "Open Anyway" guide, the Homebrew tap. | A manual check on macOS 27.0.1: first launch, firewall prompt, Local Network prompt, run at login, sleeps when idle, kept awake while players are in. |
| **S9** | **Running it for real.** The backup ladder, export and import of world bundles, the update flow with signed releases and rollback ([§11](#11-on-the-mac)), the journal, `docs/SERVER.md`, contribution.md, and README's "Playing together" rewritten. | A 2-hour soak with 8 Node players: memory flat after the first hour, p99 step under 50 ms. Restore from each backup kind. An update from the previous release migrates every fixture world, and a forced failure rolls back. |

**For the repository's owner.** S2 adds a `server` job to CI (with its Linux run), and every CI job
is a required check, so the owner will need to add it to the `main` ruleset. That PR will spell out
the steps (contribution.md, section 6).

---

## 16. Risks and open questions

| Risk | What we do |
|---|---|
| Joiners in other browsers drift from a Node host | Measured first (S0's soak). Resync already recovers; drift above the target blocks S2. |
| `SNAPSHOT_VERSION` bumps often (26 so far), and every bump now needs a migration | Fixtures plus a test that fails when a bump has no migration. The "fresh start from the seed" fallback, never silent. |
| An open port invites strangers | Only TLS from the internet, an identity proof before any secret, nothing but the status card without a key, caps, temporary blocks, a socket fuzz test, and one switch to close it ([§13](#13-security)). |
| A home Mac behind CGNAT can't be reached however the router is set | The reachability test says so plainly and offers Tailscale Funnel, or browser worlds ([§9.4](#94-behind-cgnat)). |
| Whether `duckdns.org` is on the Public Suffix List, and so whether DuckDNS users share Let's Encrypt's weekly limit, is unverified | Checked at the start of S6. The own-domain and IP routes don't depend on it. |
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
