# The world server: the plan

A plan only: nothing here is built yet. It is a living document. Each milestone updates it as it
lands, and the [change log](#18-change-log) at the end records every change and why.

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
- **Reach.** Friends on the same Wi-Fi and friends across the internet, without paid hosting.

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

| Question | Decision | Why |
|---|---|---|
| Who reaches a world | **Wi-Fi and internet.** Friends on the same Wi-Fi open the game from the Mac itself. Friends elsewhere come in through a free route with a real certificate: Tailscale Funnel (works even behind CGNAT), a router port with a free DuckDNS name and Let's Encrypt, or a quick tunnel. No paid hosting. | User's choice. Port forwarding and CGNAT are the commonest complaint about home servers, and Safari won't open plain `ws://` from an HTTPS page. So the server tests its own reachability and says plainly what works ([§9](#9-reaching-the-server)). |
| Where listings come from | **The server's own list, plus nearby Macs, plus players running the game.** No central directory. Each server lists its worlds. Servers find each other on the Wi-Fi with Bonjour. Players running the game in a browser show up through the servers they use, and the server brokers WebRTC between them. Players can also type a DNS name or IP address and port, and the game remembers it. | User's choice ([§8](#8-finding-worlds)). |
| Where heroes live | **Chosen per world.** Either the server keeps each player's hero for that world, or players bring their own hero from their device, as they do today. | User's choice ([§6](#6-heroes-kept-by-the-world-or-brought-in)). |
| The server's display | **A management page the server serves itself,** opened in any browser on the Mac, or from a phone on the Wi-Fi with the admin key. A small menu-bar launcher comes later. | User's choice. Free to ship: no Apple notarization needed ([§10](#10-the-servers-management-page)). |
| What runs a world | **The game's own rules (`core/`), unchanged, in Node.** Each running world gets its own `worker_thread`. The server speaks today's host protocol (`netplay.js`) to players, so joining needs almost no new game code. | `core/` already runs headless: the unit tests run the host, battle, war and navigation in Node, and `test/together.test.js` already hosts a world from Node on the real relay ([§1](#1-where-we-start)). |
| Time | **Stepped only while someone is in the world.** The clock freezes the moment the last player leaves, and the world is saved and set aside soon after. When the first player has finished loading back in, the clock starts again from exactly where it stopped. There's no catching up for time away. | User's requirement. It's also the industry norm (Factorio, Satisfactory, Terraria, Vintage Story); worlds that keep running unattended draw "came back to a ruin" complaints (Palworld). |
| What's saved | **The whole world.** Today only the war and each player's character survive a reload. The server saves the host's full snapshot, with rotating autosaves and tiered backups. | A shared world has to come back exactly as it was left ([§5](#5-saving-the-whole-world)). |
| Keys | **World keys, each with a role, plus a per-player return ticket.** A key gets you into a world and keeps working until its owner revokes or replaces it. The ticket brings your hero back. Both are stored hashed. All checks go through an access-policy hook, so passkeys or other sign-ins can be added later without touching worlds ([§7](#7-keys-identity-and-the-access-hooks)). | User's requirement, shaped by Satisfactory's claim and token rules, Enshrouded's role passwords and Realms' invite links. |
| Packaging | **Phase 1: `npm run world-server` from Terminal.** Terminal launches are exempt from macOS's Local Network prompt. **Phase 2: a free, ad-hoc-signed menu-bar app** that bundles arm64 Node. A Developer ID ($99/year) is optional and needs the owner's approval ([§11](#11-on-the-mac)). | Nothing that costs money without approval. |
| Rollout | **Playable milestone PRs**, as in the terrain plan. Main stays shippable, and today's browser hosting keeps working throughout ([§15](#15-milestones)). | Others contribute too. |

**How the brief reads in one place.** "Discovery should show just people running the game who can
connect point to point" is taken to mean two things:

- people running the game appear in the listing, not only servers;
- a browser-hosted world is listed as joinable only once it has shown it can be reached directly.

A world that can't be reached directly is listed as "through the server" when the server allows
relaying. Otherwise it isn't listed. [§16](#16-risks-and-open-questions) asks the user to confirm
this.

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
 │   ├─ HTTP: game client, /admin page, /api/v1                │
 │   ├─ WebSocket /play    ── players in server worlds         │
 │   ├─ WebSocket /broker  ── presence, WebRTC signalling,     │
 │   │                        relay fallback                   │
 │   ├─ worlds registry, keys, tickets, sessions               │
 │   ├─ storage: saves, backups (Application Support)          │
 │   └─ Bonjour, port mapping, keep-awake, reachability test   │
 │                                                             │
 │  world worker × N (worker_threads, one per running world)   │
 │   └─ Host + Hosting + the runner (steps, flushes, bakes)    │
 └─────────────────────────────────────────────────────────────┘
        ▲ ws/wss                      ▲ ws/wss (signalling)
        │                             │
   players' browsers  ◄── WebRTC data channel ──►  a player hosting
   (the same client)                               in their browser
```

**The supervisor** owns everything durable:
- the worlds and their settings, keys, players and heroes;
- the network edge (HTTP, the two sockets, Bonjour, port mapping);
- power: keeping the Mac awake while players are in.

It never steps a world.

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
| Only the host passes time by sleeping or camping (`#sleep`). | **A rest quorum.** Time passes when every player in the world is resting, at an inn or in camp. The share is a world setting (default 100%, like Minecraft's `playersSleepingPercentage`). A player resting alone just rests, as joiners do today. |
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
- **Hidden tabs.** "Pause when everyone is away" is on by default. If every present player's tab is
  hidden, the world freezes, as a solo world does today when its tab is hidden. Clients already
  report visibility (`paused`). Server worlds send it to the server.
- **Idle players.** An optional AFK rule (off by default, like Factorio's `afk_autokick_interval`)
  moves a player who hasn't sent a command for N minutes to "away". An idle player then doesn't keep
  the world running on their own.
- **Setting the world aside.** After "set aside" minutes (default 2) in `empty`, the worker ends and
  the world goes back to `stored`. A stored world costs no CPU and no memory. Entering it again
  starts a worker and restores the snapshot. The clock carries on from exactly where it was.
- **The management page** shows each world's state in words: for example "Running: 3 players, day
  14, dusk" or "Asleep since 21:40, day 9, morning".

**Proof.** A test enters, leaves and enters again, and checks the war's turn and clock are
identical across the gap. A wall-clock wait in between (simulated) changes nothing.

---

## 5. Saving the whole world

**What's kept**, under `~/Library/Application Support/io.github.hoffspot.pellagos-server/`:

```
server.json                    the server's settings (written only by the server)
secrets.json         (0600)    admin-key hash, session-signing key
worlds/<world-id>/
  world.json                   name, description, seed, home people, created, creator,
                               heroes mode, settings, time played, world time, versions, state
  state/now.json.gz            the latest full snapshot
  state/auto-1..5.json.gz      rotating autosaves
  heroes/<player-id>.json      kept heroes: hero, progress, standing, talks, followers,
                               wheels, explored, place, vitals, pin, messages, told
  access.json                  keys (hashed), players (ticket hashes, roles, bans, last seen)
  journal.log                  who came and went, keys issued and revoked, admin actions
backups/<world-id>/<stamp>-<why>.pellagos-world   (one gzip'd bundle per backup)
```

The world id is fixed, while its name can be changed, so links and backups survive a rename (as
with Foundry's data path). Logs go to `~/Library/Logs/io.github.hoffspot.pellagos-server/`.
Directories are `0700` and files `0600`.

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
- **The ladder.** Hourly, keeping 12, and daily, keeping 7, counted in wall-clock time while the
  world runs. A copy is also made before every version migration and before every restore. This is
  Palworld's ladder, shortened, and Foundry's backup-before-migrate.
- **What the owner can do.** List, restore and download backups, and make one by hand.
- **Corruption.** A corrupt `now.json.gz` falls back to the newest autosave that reads, and the
  journal says so.

**Versions: the new duty.** Today an old snapshot throws.

- **For server worlds.** Every bump of `SNAPSHOT_VERSION` now needs a migration from the previous
  version, the same rule `WAR_VERSION` already follows. `test/` keeps a fixture snapshot for each
  version and loads each one through the chain. contribution.md's version rules gain this line.
- **The safety net.** If a migration is missing or fails, the server offers a "fresh start from the
  seed". It keeps the war, the kept heroes and the world's time, and rebuilds the rest, which is
  exactly what a reload does today. It never does this silently: it makes a backup first and asks
  the owner.

**Importing and exporting**
- **Export.** A world's whole folder, as one `.pellagos-world` bundle. It can be imported on another
  server.
- **"Bring my world to the server."** A player's solo world (its seed, home people, war and their
  hero) can be uploaded from the game, or from a file the game saves.
  - That makes a server world with the same seed and war.
  - The player's hero becomes the first kept hero, and the player its owner.
  - The rest of the world starts from the seed, as a reload does today, because the browser never
    kept it.

---

## 6. Heroes: kept by the world or brought in

The world's creator picks the mode when making the world. The owner can change it later, after a
warning.

| | **Kept by the world** | **Brought in** |
|---|---|---|
| Where the hero lives | On the server, in `heroes/<player-id>.json`, one hero per player per world | On the player's device (localStorage), as today |
| First time in | Make a new hero for this world in the game's character maker. Or, if the world allows "bring one in on the first visit", bring an existing hero once, after which it belongs to the world. | Pick one of your saved heroes |
| Coming back | The return ticket ([§7](#7-keys-identity-and-the-access-hooks)) brings back the same hero, where they left, with their pack, gold and wounds | Bring any hero again |
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
| **Short code** (optional) | Someone being told a code aloud | Exchanged once for the world key and a ticket. Lasts 15–60 minutes and N uses, and the owner can revoke it. | 8 Crockford characters (40 bits) |
| **Return ticket** | Each player, per world | Says "this is me again": brings back a kept hero, a role and bans | 128 random bits, base64url |
| **Session** | The game, while connected | Reconnects without asking again; ends when its key is revoked or replaced, and has idle and absolute time limits | 128 random bits, short-lived |

**A long key's form.** 30 Crockford base-32 characters in six groups, for example
`KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA`.

- **The first group** names the key, so the server can look it up.
- **The other 26 characters (130 bits)** are the secret. That meets OWASP's 128-bit minimum for
  generated secrets.
- **Storage.** High-entropy keys, tickets and sessions are stored as SHA-256 and compared in constant
  time (`timingSafeEqual`). Slow hashing only matters for guessable secrets, so short codes get
  scrypt (N=2¹⁷, r=8, p=1, OWASP's minimum) as well as their short life.
- **Typing.** Keys are mainly shared as links and QR codes, but typing is forgiving: case doesn't
  matter, dashes are optional, and O reads as 0 and I or L as 1.

**Invite links** carry the key in the fragment, which browsers never send to a server, so it can't
land in a log:

```
http://studio-mac.local:8480/#join=K7Q2MXD4RT.KQ2M9-XD4RT-AH3PW-C8NVB-7J2KQ-M9XDA
https://pellagos-sam.duckdns.org:8480/#join=…                (internet, with TLS)
https://hoffspot.github.io/conquest/#server=…&join=…          (from GitHub Pages; §9.4)
```

**Where the game would rather prove than present.** Where the game runs in a secure context (rung
1, rung 3 or GitHub Pages), it also makes a non-extractable Ed25519 key pair with WebCrypto (in
every major browser since 2025) and registers its public key with the ticket. Coming back then
signs the server's nonce instead of sending a reusable secret. On plain-`http` LAN pages, which
have no WebCrypto, the ticket alone does.

### 7.2 How a key is used

1. A player enters a world: `POST /api/v1/enter {world, key, ticket?}`, or the same first line on
   the socket.
2. The server checks the key's hash, role, expiry, use count and whether it has been revoked. It
   also checks the player's ticket, if they have one, against bans.
3. **First visit:** the server issues a return ticket. The game keeps it with the server's address
   in `pellagos.servers`.
4. **Later visits:** the same key and ticket bring the same player back, with the same hero (in
   kept mode) and the same role.
5. **The key keeps working** until the world's owner revokes it, replaces it, or it reaches an
   expiry or use count they set. Replacing a key ends every session that entered with it, as
   changing a password does in Satisfactory.

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
  - **Why a second port.** Tunnels such as Tailscale Funnel and cloudflared deliver internet traffic
    to the play port *from* `localhost`. So "came from localhost" can never mean "is the owner" on
    the play port.
  - **Guards.** The admin listener is also protected against DNS rebinding and cross-site requests
    ([§13](#13-security)).
- **Forgotten admin key.** The owner makes a new one from the page on the Mac. Physical access is
  the recovery, as deleting the settings file is in Satisfactory.

### 7.4 Roles

| Role | Can |
|---|---|
| **owner** (of a world) | Everything for that world: settings, keys, players, backups, export, delete, start and stop. Owner-only commands. |
| **trusted** | Play, and issue player keys (if the owner allows) |
| **player** | Play |
| **banned** | Nothing. Bans follow the return ticket, and optionally the address for 24 hours. |
| **admin** (of the server) | Everything on the server, including every world |

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
- **Short codes.** Wrong guesses are counted per code and per world, not only per address, because
  many homes behind one CGNAT address share an IP. They back off exponentially from 1 s, doubling to
  5 minutes, with the same answer and timing whatever was wrong. After 20 failures in an hour the
  code is burned and the page shows it.
- **Long keys.** 130 bits can't be guessed, so they're limited only by the general per-address caps
  ([§13](#13-security)).
- **Logs.** Keys, codes and tickets never appear in logs. The journal records the key's name only.

---

## 8. Finding worlds

The game's **Worlds** screen merges three sources.

### 8.1 Servers the player knows

- **Typing an address.** "Add a server" takes a DNS name, an IPv4 address or an IPv6 literal, plus
  a port (default 8480). For example `studio-mac.local:8480`, `192.168.1.20:8480`,
  `[fd00::20]:8480` or `pellagos.example.duckdns.org:8480`.
- **Remembering.** The game remembers each server with its name, its keys and tickets, and when it
  was last seen. They are kept in localStorage under `pellagos.servers`, and can be exported and
  imported as a code ([§9.4](#94-from-the-browser) explains why).
- **Status.** Each known server is checked with `GET /api/v1/status`, which needs no key. It
  returns:
  - the server's name and version, `NET_VERSION`, the snapshot version and the build;
  - the listed worlds: name, description, home people, players in now and the most allowed, state,
    heroes mode, whether a key is needed, and the world's age and time played;
  - nearby servers;
  - listed players' worlds;
  - the round-trip time.

  This follows Minecraft's server list ping and Satisfactory's save headers.
- **Version mismatch.** A server whose `NET_VERSION` differs is greyed out. It offers "Open the game
  from this server", which always matches.
- **Unlisted worlds** appear only for players who hold a key or ticket for them.

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

[§9.5](#95-webrtc-between-browsers) covers STUN, the iPhone's quirks and how often direct
connections succeed.

---

## 9. Reaching the server

What browsers allow in 2026 decides most of this section. These are the facts it rests on (the
research notes cite each one):

- **Safari blocks plain `ws://` from an HTTPS page.** On the Mac and iPhone, a `ws://` connection to
  `localhost` or a home address from an HTTPS page such as GitHub Pages is still blocked as mixed
  content (WebKit bug 171934, open since 2017).
- **Chrome and Firefox allow it, with a prompt.** Chrome 147 and later allow `ws://` to a private
  IP or a `.local` name from an HTTPS page, after a "local network" permission prompt. Firefox is
  rolling out the same prompt from 151.
- **The reliable path.** A page *served by the Mac itself* (`http://studio-mac.local:8480`) talking
  to the same Mac triggers no prompt and no mixed-content block in any browser. Chrome 154's new
  "HTTPS by default" warning leaves private addresses alone.
- **The cost of that path.** Such a page isn't a secure context, so it gets no WebCrypto, service
  worker, passkeys or async clipboard. The game already copes: `fetcher.js` checks for
  `crypto.subtle`, the service worker registers only in secure contexts, and copying falls back.
- **From outside, a real certificate is needed.** Reaching the Mac from outside the home network
  needs `wss://` with a certificate every browser trusts. Self-signed certificates won't do on an
  iPhone without installing a profile.

### 9.1 The ladder

The management page shows each rung with its address, a QR code and whether it works right now.

| Rung | Address players use | Works for | Needs | Cost |
|---|---|---|---|---|
| **1. This Mac** | `http://localhost:8480` | The owner, on the Mac | Nothing | Free |
| **2. Same Wi-Fi** | `http://studio-mac.local:8480` or `http://192.168.1.20:8480`. The game is served by the Mac. | Every browser, iPhone included | Nothing. macOS asks no permission to accept connections. | Free |
| **3a. Internet through Tailscale Funnel** | `https://studio-mac.<tailnet>.ts.net` (also 8443 or 10000) | Every browser, anywhere, **including behind CGNAT**, with no router changes | The owner installs Tailscale (the open-source client on macOS) and allows Funnel. The server runs `tailscale funnel --bg 8480`. | Free (the Personal plan counts the owner, not visitors). Funnel's bandwidth cap is unpublished, but play needs about 2 KB/s per player. |
| **3b. Internet through the router, with a free name** | `https://pellagos-sam.duckdns.org:8480` | Every browser, anywhere | Port mapping ([§9.2](#92-port-mapping-and-the-reachability-test)) or a manual forward. A DuckDNS name and token. A Let's Encrypt certificate through DNS-01 using DuckDNS's TXT API ([§9.3](#93-tls-without-paying)). Not behind CGNAT. | Free |
| **3c. Internet through the router, by IP** | `https://203.0.113.7:8480` | Every browser, until the home IP changes | Port mapping, including 443 for validation. A Let's Encrypt *IP certificate*, 6-day "shortlived", renewed every 3 days. | Free |
| **3d. For tonight only** | `https://<random>.trycloudflare.com` | Every browser | `cloudflared tunnel --url http://localhost:8480`, no account. The name changes every run, so keys must be re-shared. | Free |
| **4. Players' browser worlds** | Through the broker on any server they know ([§8.3](#83-players-running-the-game)) | Every browser | WebRTC, falling back to relaying | Free |

**Not used:**
- **ngrok's free tier** puts a warning page in front of all browser traffic.
- **playit.gg's free tier** has no HTTPS.
- **Steam Datagram Relay and PlayFab** need native SDKs.
- **Cloudflare TURN** costs $0.05 per GB.

**Not assumed: a shared public relay.** The networking research's own first recommendation is a
public relay that every Mac dials out to, following the Home Assistant cloud and Syncthing relays.
It would work behind CGNAT with nothing to install. But someone has to host it, and today no relay
is hosted anywhere. That would be paid hosting, which the user ruled out. If the owner later finds
free hosting they're happy with, the broker protocol of [§12.3](#123-websocket-broker-subprotocol-pellagosbroker1)
is already the relay's protocol: a Mac would announce its worlds there as a browser host does.

### 9.2 Port mapping and the reachability test

- **Asking the router.** When "Open to the internet" is chosen without a tunnel, the server asks the
  router for a mapping. It tries PCP (RFC 6887) first, then NAT-PMP (RFC 6886: UDP 5351, a 2-hour
  lifetime renewed at half-life; it's in Apple's own routers), then UPnP-IGD. It maps TCP 8480,
  plus 443 when an IP certificate is in use. Mappings are renewed while the server runs and removed
  on stop. This follows Foundry, which turns UPnP on by default.
  - **Permission.** Talking to the router counts as reaching the local network, so a LaunchAgent or
    app needs macOS's permission; a Terminal launch doesn't ([§11](#11-on-the-mac)). If it's
    refused, the page says so and explains how to forward the port by hand.
- **Finding the public address.** The router's answer, and a STUN request to `stun.cloudflare.com`
  or `stun.l.google.com`. These are free and public, but come with no service promise.
- **Spotting CGNAT.** The router's external address falls in `100.64.0.0/10` or differs from the
  STUN answer. The page then says plainly: "Your internet provider shares one address between many
  homes, so friends can't reach this Mac directly. Use Tailscale Funnel (free) or a tunnel."
- **Proving it from outside.** No central checker is assumed.
  - **On the Mac:** the server tries its own public address through the router (hairpin). Success
    proves the port is open. Failure proves nothing, because many routers don't hairpin.
  - **From outside:** the definitive test is the game's **"Test this server"** button on any device
    on another network (a phone on cellular), which reports the result back to the server's page.
  - **Free extra proof:** a Let's Encrypt IP certificate can only be issued if the port is
    reachable.

### 9.3 TLS without paying

- **The ACME client.** The server carries a small ACME client (RFC 8555, built on `node:crypto`)
  and stores the account key and certificates in the data folder (`0600`).
- **DuckDNS (rung 3b).**
  - **The certificate.** DNS-01: the server sets `_acme-challenge` through DuckDNS's `&txt=` API,
    and renews 30 days before expiry. Let's Encrypt is shortening certificate lifetimes from 90 to
    45 days over the next few years.
  - **The address.** The same DuckDNS token keeps the name pointed at the home's address.
  - **Unknown: shared rate limits.** Whether `duckdns.org` is on the Public Suffix List decides
    whether all DuckDNS users share Let's Encrypt's 50 certificates a week. The fallback is
    another free DNS host with a TXT API, or rung 3a.
- **IP certificates (rung 3c).**
  - **The certificate.** The "shortlived" profile (160 hours), renewed every 3 days. Validation is
    HTTP-01 or TLS-ALPN-01, never DNS-01, so 80 or 443 must reach the Mac.
  - **When the address changes.** The certificate and links break when the home's IP changes, so
    the page warns that this rung is best for a weekend.
- **Tunnels (rungs 3a, 3d)** bring their own certificates, and the server needs none.
- **The rule from [§13](#13-security):** an internet address is only ever offered with TLS. On the
  Wi-Fi, plain `http`/`ws` is accepted, and the page says traffic there isn't encrypted.
- **Later: WebTransport** with `serverCertificateHashes` (Baseline 2026, Safari 26.4) would let a
  page reach a self-signed server by its certificate's hash, with no domain needed. It needs an
  HTTP/3 server, which Node doesn't yet offer in a stable form. Revisit when it does.

### 9.4 From the browser

**Where the game comes from decides what it can reach:**

| The game was opened from | It can reach |
|---|---|
| The server itself (`http://…:8480`, rungs 1–2) | That server always. Any `https://` server (rung 3). Browser-hosted worlds through that server's broker. |
| GitHub Pages (`https://hoffspot.github.io/conquest/`) | Any server with a real certificate (rungs 3a–3d). A LAN server by `ws://` in Chrome or Firefox after their prompt (private IP or `.local` only), **never in Safari**. |

**When a typed address can't be reached from this page,** the game says why and offers the way
that works. For example: "Safari can't open an unencrypted connection to your home network from
this page. Open the game from the server instead: http://studio-mac.local:8480".

**Carrying a key across.** Following that link moves the player to the server's own page, carrying
the world and key, and the ticket if there is one, in the fragment.

**Every origin has its own storage.** `https://hoffspot.github.io` and
`http://studio-mac.local:8480` don't share localStorage. So:

- invite links carry what's needed in the fragment;
- **"My servers and tickets"** can be exported and imported as a code or QR, which also survives
  Safari wiping a site's storage after 7 days without a visit;
- a world's owner can **reissue** a lost player's ticket from the Players section, and the hero
  comes back.

**Typed addresses.** The game accepts `host`, `host:port`, `ws(s)://…`, `[v6]:port` and invite
links. It tries `wss://` first, then `ws://` where the browser allows it, then offers the server's
own page.

**Recognising a server again.** Each server has a key pair, and its id is the fingerprint of its
public key, as Syncthing identifies devices. The game pins it on first contact, and warns if a
remembered address starts answering with a different id.

### 9.5 WebRTC between browsers

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

On the Mac the page opens at `http://localhost:8481/`, the admin listener bound to `127.0.0.1`, and
needs no key. Elsewhere it's at `/admin` on the play port (for example from a phone on the Wi-Fi),
where it always needs the admin key. It uses the same `/api/v1` the game uses, and the same look as
the game's menus, built from the game's CSS colours.

| Section | What it shows and does |
|---|---|
| **Overview** | The server's name. Its addresses: `localhost`, `name.local`, the LAN IP, the internet address with its reachability test result, and any tunnel URL. QR codes for each. Version and uptime. Whether the Mac is being kept awake, and a warning when on battery or with the lid likely to close. |
| **Worlds** | A card per world. **Shows:** name, home people, seed, created, time played, world day and hour, state in words, players in now, heroes mode, size on disk. **Buttons:** Play (opens the game into this world), Start, Set aside, Keys, Players, Backups, Settings, Export, Delete. Delete needs the world's name typed, as Foundry does. Worlds are sorted by most recently played. |
| **New world** | **Settings:** name, description, seed (random, or typed), home people, heroes mode, most players (up to 8), listed or unlisted. **Rules:** rest quorum, hold while joining, pause when everyone's away, AFK minutes, debug commands. **Then:** issues the first owner key and a player key. |
| **Keys** | Per world: label, role, created, last used, uses, expiry. Issue, show (as text, link and QR), revoke, replace. |
| **Players** | Per world, who's in now and everyone who has been. **For each:** name, hero, role, first and last seen, and time in the world. **Buttons:** kick, ban, unban, change role. |
| **Backups** | Per world: the ladder and autosaves, with when, why and size. Restore (a backup is made first), download, make one now. |
| **Server settings** | **Network:** port, listen addresses, Bonjour, port mapping, TLS, broker, relaying. **World making:** who may make worlds (admin only, holders of creator keys, or anyone). **Running:** autosave and set-aside timings, most worlds running at once (default 2), keep the Mac awake while players are in, data folder. |
| **Activity** | The journal: entries, exits, keys, refusals, admin actions, saves and their times. |
| **Health** | Per running world: step time (mean and p99), the worst step and what made it, memory, snapshot size, players, bandwidth. The server's CPU and memory. Like Satisfactory's `HealthCheck`, a world is "slow" when its steps fall behind. |

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
| The application firewall identifies programs by their signature. Ad-hoc or unsigned builds are asked again after each update. | Tell the owner once. A Developer ID would fix it, but costs $99 a year. |
| launchd no longer loads plists carrying the quarantine attribute. | Never write LaunchAgent plists from a download. Phase 2 registers its agent from inside the app bundle with `SMAppService`. |
| Sleep stops the server. | Hold a power assertion only while players are in: `caffeinate -i -w <pid>`, started on the first entry and ended on the last exit. Warn on battery and with the lid closed. Never change `pmset` for the owner. |
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
- **Signing.** Ad-hoc, distributed as a zip with a one-page guide to "Open Anyway" in Privacy &
  Security. Control-click › Open no longer bypasses Gatekeeper since macOS 15.
- **Updates.** "Check for updates" opens the releases page. Sparkle needs a Developer ID to work
  reliably.
- **Optional, needs approval.** A Developer ID ($99 a year) for notarisation, permissions that stick
  across updates, and Sparkle. Not assumed.

**Other platforms.** Nothing in the server is Mac-only except Bonjour, the keep-awake call and the
menu-bar app, so Linux and Windows hosts come almost free. They aren't promised.

---

## 12. The protocol

Two parts on one port: an HTTP JSON API for listing and management, and two WebSockets for play
and brokering. All of it is versioned: the API by its path (`/api/v1`), the sockets by subprotocol
(`pellagos.play.1`, `pellagos.broker.1`), and play by `NET_VERSION`, as today.

### 12.1 HTTP: `/api/v1`

| Method and path | Needs | Does |
|---|---|---|
| `GET /status` | nothing (rate-limited) | The server's card, its listed worlds, nearby servers, listed players' worlds and versions ([§8.1](#81-servers-the-player-knows)) |
| `GET /health` | nothing | `ok` or `slow` |
| `POST /enter` `{world, key?, ticket?}` | a key or ticket | `{session, ticket?, role, world, heroes, hero?}` with the hero in kept worlds. Refusals say why: `no-world`, `key`, `banned`, `full`, `locked`, `version`, `wait n` |
| `GET /worlds` | a session or the admin key | Listed worlds, plus unlisted worlds the caller holds keys for |
| `POST /worlds` | `world.create` | Make a world. Returns `{world, ownerKey, playerKey}` |
| `PATCH /worlds/:id`, `DELETE /worlds/:id {confirm}` | owner | Change settings, or delete (with the world's name typed) |
| `POST /worlds/:id/start`, `/aside`, `/save` | owner | Lifecycle |
| `GET`, `POST`, `DELETE` `/worlds/:id/keys[/:key]`; `POST …/keys/:key/replace` | owner, or trusted for player keys | Keys |
| `GET /worlds/:id/players`; `POST …/players/:p/kick`, `/ban`, `/unban`, `/role` | owner | Players |
| `GET`, `POST` `/worlds/:id/backups`; `POST …/backups/:b/restore`; `GET …/export`; `POST /worlds/import` | owner (import: `world.create`) | Backups and moving worlds |
| `GET`, `PATCH` `/server`; `GET /server/journal`, `/server/health` | admin | Settings and health |

- **Authorisation.** `Authorization: Bearer <session>`.
- **Errors.** `{error: code, message}`.
- **CORS.** Only `/status`, `/enter` and `/worlds` answer cross-origin, so the game can use them
  from GitHub Pages. Management calls answer only to the server's own origin.

### 12.2 WebSocket `/play` (subprotocol `pellagos.play.1`)

The framing is today's relay framing (a first line, `\n`, then the payload), so `RelayLink`'s
heartbeat, backoff and grace carry over unchanged. Only the place lines differ.

| Today (relay) | Server world |
|---|---|
| `join CODE` → `joined pN TOKEN` | `enter WORLD SESSION` → `entered pN TOKEN` |
| `rejoin CODE PEER TOKEN` | `reenter WORLD PEER TOKEN` |
| `data\n…` to the host | `data\n…` to the world worker |
| `away`, `back`, `closed` | `away` and `back` (the world is restarting), `closed REASON` (`kicked`, `banned`, `key-revoked`, `world-deleted`, `server-stopping`) |

- **What's inside is unchanged.** `data` carries today's netplay messages: `hello`, `welcome`,
  `ops`, `motion`, `state`, `paused`, `ping`, `pong`, `chat`.
- **Two new message kinds**, joiner to host: `ready` (finished loading, which starts a frozen
  clock) and `away {hidden}` (tab hidden or shown).
- **`hello` gains a field:** `ticket` for kept heroes. In kept worlds the hero comes from the server
  and the client's `character` is ignored.
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
- **Origin checks** on both sockets and on cross-origin API calls, as an exact allowlist with no
  wildcards and `null` refused. Allowed: the server's own origins, `https://hoffspot.github.io`, and
  any origins the owner adds. This stops cross-site WebSocket hijacking; it doesn't stop bots, which
  is what keys are for.
- **The admin listener.** Key-free management lives only on `127.0.0.1:8481`
  ([§7.3](#73-the-owner-and-claiming-the-server)). It is never on the play port, which tunnels
  reach from `localhost`.
- **Guarding against DNS rebinding** on both listeners. Requests whose `Host` isn't one of the
  server's own names or addresses are refused.
- **Guarding against cross-site requests.** Management calls also need a custom header and a
  same-site cookie, so another website open on the Mac can't drive them.
- **Sign-in comes first.** Authentication is in the first message, never in a URL's query string.
  A socket that hasn't entered within 10 s is closed.

**How much it will take**
- **Size caps.** 4 MiB for `welcome` and `state` (the snapshots), and 64 KB for every other message
  (OWASP's guide). The 8 MiB backlog and the pings with timeouts stay as today.
- **Rate caps.** About 100 messages a minute per player for chat and signalling. Game commands get
  their own, higher, cap.
- **Connection caps,** per identity first:
  - 3 sockets per ticket;
  - 32 per address, set high because CGNAT shares addresses;
  - 64 players across the server.
- **Other guards.**
  - Slow-request and idle timeouts on HTTP;
  - a fuzz test for the hand-written WebSocket parser;
  - compression (permessage-deflate) left off, as the `ws` library advises for servers.

**Keys and secrets**
- **Storage.** Keys and tickets are stored hashed, never logged, and carried in URL fragments
  rather than query strings.
- **The internet needs TLS.** An internet address is offered only with TLS, from the server or a
  tunnel ([§9.3](#93-tls-without-paying)). On the Wi-Fi, plain `http`/`ws` is accepted, and the
  page says so.

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
| Invite links with expiry and a limit | Minecraft Realms (7-day default, 5 links) | Optional expiry and use counts, up to 10 live keys |
| Stable invite codes (not new on every restart) | Valheim's join codes change each restart and players complain | Keys last until revoked |
| Characters kept on the server | Factorio, Satisfactory, V Rising, Foundry; Valheim needs mods | "Kept by the world" mode ([§6](#6-heroes-kept-by-the-world-or-brought-in)) |
| A reconnect window that keeps your place | V Rising `SafeReconnectTime` | 30 s grace, frozen if alone |
| Throttle full-map downloads | Factorio `max_upload_slots` | 2 welcomes at once |
| Status ping with version, players and description | Minecraft server list ping | `GET /status` |
| Rotating autosaves and tiered backups | Factorio (5 slots); Palworld (30 s, 10 min, hourly, daily); V Rising SmartKeep | 5 autosaves, 12 hourly, 7 daily ([§5](#5-saving-the-whole-world)) |
| Back up before migrating a world to a new version | Foundry; Valheim 1.0 | Always |
| Admin API on localhost by default; TLS and tokens when exposed | Minecraft management protocol; Palworld's "don't expose the REST API" | Management only on the Mac without a key; internet only with TLS |
| UPnP on by default, with a reachability check | Foundry `upnp: true` | [§9.2](#92-port-mapping-and-the-reachability-test) |
| Serve the matching client | Foundry (players need only a browser link) | The server serves its own build |
| Graceful stop that saves | Valheim's "closing the window leaves it running" trap | Stop saves; the page says when it's safe |
| AFK kick | Factorio `afk_autokick_interval` | Optional "away" after N minutes |
| Sleep needs everyone (or a share) | Minecraft `playersSleepingPercentage` | The rest quorum ([§3.2](#3-running-a-world-without-a-browser)) |
| A browser reaches a home server securely | Plex's per-server certificates under `plex.direct` (needs a paid CA partnership and trips routers' DNS-rebinding guards); Home Assistant's relay (paid) | The free rungs of [§9.1](#91-the-ladder): the Mac's own page on the Wi-Fi, Tailscale Funnel, DuckDNS with Let's Encrypt |
| Devices known by a key's fingerprint, pinned on first use | Syncthing device ids | The server's id is its key's fingerprint ([§9.4](#94-from-the-browser)) |
| "Same network" from the same public address | Philips Hue bridge discovery | The broker's "probably on your network" hint ([§8.2](#82-nearby-macs)) |
| Signalling broker with peers relaying when direct fails | PeerJS PeerServer (listing off by default); Syncthing relays | The broker, with relaying over its WebSocket ([§8.3](#83-players-running-the-game)) |

The sources for each row are in `research_notes/Standalone world server hosting/`
(`dedicated_servers.md`, `network_discovery_access.md`, `macos_hosting.md`), which isn't committed.

---

## 15. Milestones

Each one is a pull request that leaves the game playable. Each lists what proves it.

| # | Milestone | Proven by |
|---|---|---|
| **S0** | **The runner and host-free worlds.** `core/runner.js` takes the glue out of `game.js`, and the browser game uses it. There is a rule for worlds with no `HOST_PLAYER` (rest quorum, owner-only debug). Baking happens ahead in workers on Node. Plus the cross-engine soak. | Existing e2e unchanged. New: a Node runner with a Node joiner for 10 min with no resyncs. The soak: under 1 resync per player-hour in Chromium, WebKit and Firefox. No step over 50 ms in the 4-town run. |
| **S1** | **The whole world saved.** Snapshot save and load via the runner, gzip, atomic writes, the heroes store, the `SNAPSHOT_VERSION` migration chain with fixtures, the "fresh start from the seed" fallback, and the solo-world import. | Save, restart the process, restore: identical checksum. Every fixture loads. A corrupt file falls back to an autosave. |
| **S2** | **The server.** The supervisor, world workers, the registry, the lifecycle of [§4](#4-a-worlds-life-and-its-time), `/api/v1` (status, enter, worlds, create), `/play`, keys, tickets, sessions, the access policy, limits, `npm run world-server`. | Node clients over real sockets: make a world, enter with a key, leave (frozen: the war's clock identical), come back (same hero, same place), revoke the key (closed `key-revoked`). Two worlds at once. Ending a worker frees its memory. Fuzz the socket. |
| **S3** | **The game's Worlds screen.** Known servers, adding a server by address, status, entering keys, making a world, kept or brought-in heroes, invite links with the server in them, version mismatch handling, the in-game World panel (who's here, keys, leave). | e2e against a local world server: two browser contexts, one makes a world and shares the key; the other enters, plays and leaves; the world freezes; the second comes back to its hero. |
| **S4** | **The management page.** Every section of [§10](#10-the-servers-management-page), the Mac-only rule, the admin key from other devices, DNS-rebinding and CSRF guards. | e2e of the page: make, set aside, back up, restore, delete. A test that a foreign `Host` or `Origin` is refused. |
| **S5** | **Nearby Macs.** Bonjour advertising and browsing, `nearby` in status, the page's addresses and QR codes, clean failure when macOS refuses. | Unit tests with a fake responder. A manual check on two Macs on macOS 27.0.1. |
| **S6** | **The broker and players' worlds.** Presence, signalling, the WebRTC `Link` for browser-hosted worlds, the reachability check, relay fallback, the client's "Players" list. Today's `/relay` kept for one release, then removed. | e2e: two browser contexts on loopback connect over WebRTC through the broker. Forcing ICE to fail falls back to relaying. Announcement expiry. |
| **S7** | **Internet reach.** Port mapping (PCP, NAT-PMP, UPnP), the CGNAT check, "Test this server", the ACME client (DuckDNS DNS-01; IP certificates), helpers for Tailscale Funnel and Cloudflare quick tunnels, and the GitHub Pages path with the "open from the server" hand-off ([§9](#9-reaching-the-server)). | Unit tests against a fake router and a fake ACME server (Pebble). A manual check from a phone on cellular through each rung, in Safari and Chrome. |
| **S8** | **The Mac app.** The menu-bar wrapper, bundled Node, the `SMAppService` agent, keep-awake, plist keys, ad-hoc signing, the "Open Anyway" guide, the Homebrew tap. | A manual check on macOS 27.0.1: first launch, firewall prompt, Local Network prompt, run at login, sleep while idle, kept awake while players are in. |
| **S9** | **Running it for real.** Backup ladder, export and import of bundles, update flow (never while players are in; backup and migrate on first start), AFK, the journal, `docs/SERVER.md`, contribution.md, README "Playing together" rewritten. | A 2-hour soak with 8 Node players: memory flat after the first hour, p99 step under 50 ms. Restore from each backup kind. |

**For the repository's owner.** S2 adds a `server` job to CI, and every CI job is a required check,
so the owner will need to add it to the `main` ruleset. That PR will spell out the steps
(contribution.md, section 6).

---

## 16. Risks and open questions

| Risk | What we do |
|---|---|
| Joiners in other browsers drift from a Node host | Measured first (S0's soak). Resync already recovers; drift above the target blocks S2. |
| `SNAPSHOT_VERSION` bumps often (26 so far), and every bump now needs a migration | Fixtures plus a test that fails when a bump has no migration. The "fresh start from the seed" fallback, never silent. |
| A home Mac behind CGNAT can't be reached however the router is set | The reachability test says so plainly and offers the free tunnel route ([§9](#9-reaching-the-server)). |
| macOS Local Network bugs (Bonjour, port mapping) on 27.0.x | Play doesn't depend on them. Each failure says what to do. A supported reset arrives in 27.2. |
| Pages (HTTPS) can't open `ws://` to a LAN address in Safari (Chrome and Firefox only after a prompt) | Every server serves the game itself; the Pages build hands players over to it ([§9.4](#94-from-the-browser)). |
| Whether `duckdns.org` is on the Public Suffix List, and so whether DuckDNS users share Let's Encrypt's weekly limit, is unverified | Rung 3a (Tailscale Funnel) doesn't depend on it. Checked before S7 picks DuckDNS as the default. |
| Tailscale Funnel's bandwidth cap is unpublished | Players load the game from GitHub Pages and use Funnel only for the socket (about 2 KB/s each). |
| Whether Chrome's local-network prompt also covers WebRTC is contradicted in Chrome's own sources | Tested in S6. Relaying through the broker is the fallback either way. |
| A browser world hosted on an iPhone vanishes when Safari is backgrounded | Marked "temporary"; announcements expire after 45 s. |
| Heroes, tickets and known servers live per browser origin, so `http://studio-mac.local:8480` and `https://hoffspot.github.io` don't share them | Export and import of "my servers and tickets" as a code. A kept hero comes back with its ticket on any origin. |
| An internet-facing Node server | [§13](#13-security) from S2 on, and a fuzz test on the WebSocket parser. |
| Worlds with no host player hide other assumptions | S0 runs long host-free soaks. |
| Recast's wasm heap grows over long sessions | One worker per world, ended when the world is set aside. Memory is shown on the page. |

**For the user to confirm** (sensible defaults are in the plan already):

1. "Discovery shows just people running the game who can connect point to point." The plan lists
   browser-hosted worlds only once they have shown they can be reached directly, or as "through
   the server" when relaying is allowed. Is that the intent?
2. Defaults:
   - set a world aside after 2 minutes empty;
   - "pause when everyone is away" on;
   - AFK off;
   - rest quorum 100%;
   - up to 2 worlds running at once;
   - port 8480.
3. Kept heroes: one hero per player per world. Should a player be able to keep several heroes in one
   world?

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
