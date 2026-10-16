# The world server

The world server keeps worlds that players come and go in. A world goes on being there when
everyone's left: saved as it was, its war's clock stopped, and carried on when someone comes back.
It runs on a computer at home (a Mac first), reached from the Wi-Fi and, once it's set up, from the
internet. Up to 8 players are in a world at once. The game itself is served from it too, so a
player only needs its address.

This is the guide for whoever runs one. How it's built, and why, is in
[generated/world_server_plan.md](../generated/world_server_plan.md). The Mac app has its own guide,
[MAC_APP.md](MAC_APP.md).

## Running it

There are two ways, and each keeps its worlds in the same place on a computer, so run only one
at a time.

| How | Start it | Stop it |
| --- | --- | --- |
| **The Mac app** (menu bar) | Installed with `curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh \| bash` in Terminal, which opens it ([MAC_APP.md](MAC_APP.md#installing-it)); after that, open **Pellagos Server** | Its menu's **Stop** or **Quit** |
| **A copy of this repository** | `npm run world-server` (Node 22 or newer) | Ctrl-C |

Stopping it always saves every world first. From Terminal, `-- --port 9000 --data /tmp/worlds`
gives another port and data folder, and `-- --admin 9001` another port for the management page.
(There's no Homebrew tap: [MAC_APP.md](MAC_APP.md#without-the-app-terminal).)

The first time it starts, it prints its **admin key**, once. Keep it somewhere safe: it manages the
server from another device on the Wi-Fi, and makes worlds from the game. On the server's own
computer the management page needs no key. If the key's lost, **Make a new admin key** on the
page's Overview (on the computer itself) makes another, and the old one stops working.

## The management page

On the server's computer: <http://localhost:8481>. From another device on the Wi-Fi: the server's
address with `/admin`, for example `http://my-mac.local:8480/admin`, and the admin key. It's never
answered from the internet. Its tabs:

- **Overview.** Its name, its id (players' games check it's the same server each time), its
  addresses on the Wi-Fi with QR codes, how long it's been up, how many worlds it runs at once,
  the admin key, and the internet (below).
- **Worlds.** Each world, how it is ("Running: 3 players, day 4, 14:00", "Set aside: saved"), and
  what can be done with it: start it, set it aside (everyone in it is sent out and it's saved),
  save it now, its settings, keys, players and backups, export it, delete it (its name typed).
- **New world.** Its name, seed and home people, whether heroes are kept by the world or brought
  in by their players, its rules, and **Or bring a world in** (below).
- **Settings.** The server's settings, **Updates** (below), and creator keys: whoever holds one
  makes worlds of their own here, and owns them.
- **Activity** (what's happened, the server's and each world's) and **Health** (each world's
  steps and memory, and the server's).

## Worlds and who comes in

A world is reached with a **key**. Making one gives two: the **owner's** and the **players'**.
Keys have a role:

| Role | May |
| --- | --- |
| Owner | Everything: its settings, keys, players, backups; the debug commands, if its rules allow them |
| Trusted | Play, and give others keys, if its rules allow it |
| Player | Play |

A world has at most 10 keys that work at once. A key can be revoked, and everyone who came in with
it is sent out. Instead of a long key, a **short code** (8 letters and digits, for saying aloud or
typing on a phone) works once. Whoever comes in is given a **ticket**, kept by their game, so they come back
without the key. A lost ticket is given again from the world's Players tab; the old one stops
working. A player can be banned (by their ticket, and their address for 24 hours) and let back.

A world either **keeps** its players' heroes (up to 6 a player, made there, or one brought in the
first time if its rules allow it), or players **bring** the heroes they have in their game. It can
be switched while the world's set aside.

**Heroes as files.** The heroes a world keeps can leave it as character files, the same files the
game's Saved characters exports and brings in (`.pellagos-character`):

- A player **takes one home** when they choose who goes in (**Take one home**): a copy of that hero
  is kept in their game, in the world's land and with its war as it was last saved, to play by
  themselves or to bring into another world. The hero stays in the world as they are.
- Where a first hero may be brought in, a player can **bring one from a file** (**Bring one from a
  file**), as well as one their game keeps.
- The world's owner **exports a player's heroes** from the Players tab (**Export heroes**): every
  hero of theirs kept there, in one file, to give them or keep.

A hero kept by an older version of the game, or brought in from an older file, comes in as this
version plays them: whatever it no longer has (things, spells, skills, callings, a people or a
weapon) is left out or put right, and the world's journal says what. Brought in from a file, the
game says it first.

A world with nobody in it waits 2 minutes, then it's saved and **set aside**: it uses nothing
until someone comes in. Two worlds run at once by default (the page says how many the computer can
take); a third waits its turn. While anyone's in a world, the computer is kept awake.

Players add the server in the game's **Worlds on servers** (by its address, from an invite link or
QR code, or from the servers found nearby on the Wi-Fi), then come into a world with its key or
code, or make one with a creator key or the admin key.

## Reaching it from the internet

From the Wi-Fi, players use the addresses on the Overview. From the internet, the server answers
over TLS alone, once it has a certificate and it's **Open to the internet** (the Overview's
internet panel):

1. **A way in.** A free certificate from Let's Encrypt, which the server gets and renews itself:
   with a free DuckDNS name (the simplest), a domain of the owner's own on Cloudflare or deSEC, or
   the home's IP address. Or a certificate of the owner's own. Or, for a home whose provider shares
   its address (CGNAT), **Tailscale Funnel**, which needs Tailscale installed and signed in.
2. **The router.** The server asks it to let players in (PCP, NAT-PMP or UPnP). If the router
   won't, the page says which port to forward by hand.
3. **Tested from outside.** The game's **Test this server**, from a phone on its mobile data,
   tries every way in and tells the page how it went.

**Close to the internet** stops answering it at once.

## Players' own worlds

A player who opens their own game's world to others (the game's **Invite others**) can list it on
the server (its **broker**), and others join it point to point (WebRTC). When their games can't
connect directly, the server relays them, about 2 KB/s for each player who's joined. The
**broker** and **relaying** settings turn either off.

## Archives

**Settings › Archive › Archive everything** downloads the whole server as one file
(`<name>-<when>.pellagos-archive`): every world (its saves, the heroes it keeps, its keys' and
tickets' hashes, its players and bans, its journal), the server's settings, its admin key and
creator keys (their hashes), its certificates, its journal, and the key it proves its id with.
Every world going is saved first. Not its backups, the versions updates installed, nor a DNS
host's token (give that again on the Overview). Keep it as you'd keep a password: whoever has it
can stand in for this server.

**From an archive** (Settings › Archive): choose it and **Open it**. The page lists its worlds,
each with what will happen to it: carried on as it was, or (saved by a version of the game older
than this one can bring forward) its land started afresh from its seed, its war and its kept
heroes kept. Then either:

- **Restore everything**, on a server with no worlds of its own (a fresh install): the server
  starts again with everything as it was in the archive, the same server to players' games
  (its id), whose keys and tickets all work, and whose admin key is the archive's. What was here
  is kept in `backups/server/<when>-before-restore/`. An archive made by an older server is brought
  forward as it's opened, as any data folder is.
- **Bring them in as new worlds** (those ticked): each a new world here, with keys of its own,
  shown once. The keys it had don't work here.

From Terminal, with the server stopped: `node server/world.js --archive <file or folder>` makes
one from the data folder (`--data` for another), and `--restore <archive>` stages one to be put in
place when the server next starts (refused where there are worlds, but with `--replace`). On a
Mac, the app's **Uninstall…** and the installer's `--uninstall` offer to make one, in Documents,
before everything is taken away ([MAC_APP.md](MAC_APP.md#updating-and-taking-it-off)).

## Keeping worlds safe

Every world keeps:

- **Its latest save** and the **5 before it** (autosaves), saved each war turn while it runs, when
  it's set aside, and when the server stops. A save that won't read is passed over for the newest
  that does, and the journal says so.
- **Backups:** one an hour (the last 12 kept) and one a day (the last 7), and one before anything
  that can't be undone: a restore, a fresh start, an update, a deletion. **Back up now** makes one
  by hand. Those made by hand or before something are kept until they're deleted.

A world is restored from any backup on its Backups tab: it's set aside, backed up as it is first
(so a restore can be undone), then put back. Its keys, players and journal stay as they are now.

**Export** (on the world) downloads it as one file, `<name>-<when>.pellagos.json.gz`: what it is,
its latest save, and the heroes it keeps. **Or bring a world in** (New world) takes such a file, from
this server or another, and makes it a new world here with keys of its own (the keys it had don't
work here). A file from a newer server is refused, saying so; one bigger than 64 MB isn't read.

A world kept by an older version of the game is brought forward when it's opened. One that can't
be (none of its saves read, or it was saved by a version older than this one brings forward) can
be **started afresh** from its seed (its Backups tab, **Start it afresh**), keeping its war and its
heroes, with a backup first. One brought in from a file or an archive that's too old is started
afresh so as it's brought in, and the page says so. Every step that brings a save forward is kept
from one version to the next, so nothing saved since this was written is ever too old.

## Updating

**Settings › Updates** says which version this is. Once a day (the **Check once a day** setting),
the server asks the project's releases whether there's a newer one, and if so shows it with its
notes. **Check now** asks at once.

**By itself, overnight** (the **Install new versions by itself** setting, on unless it's turned
off): from 3 in the morning for two hours (this computer's time; the hour's its own setting), the
server asks the releases again and installs a newer one once nobody's in, as **Update** does
below, every world backed up first. It looks every 10 minutes then, so a player still in at 3
only puts it off. It never tries again a version that failed (rolled back, or stopped in the last
12 hours): the next one, or **Update**, does. The computer has to be awake then: on a Mac kept as
a server, turn on **Prevent automatic sleeping when the display is off** (System Settings ›
Energy). The journal (Activity) says when it did.

**Update** (on the Mac app's server, or one unpacked from a release):

1. Waits for nobody to be in: it's refused while players are in. Set their worlds aside first.
2. Downloads the new version and checks it's the project's: that its archive is the one GitHub
   has for the release (the SHA-256 GitHub keeps for it, as the Mac installer checks its zip); or,
   on a server with the project's release key (below), that the project signed it. One that isn't
   is never installed.
3. Sets every world aside and backs it up, and backs up the server's settings, keys and
   certificates.
4. Unpacks the new version beside this one (in the data folder's `versions/`: the app itself is
   never changed), then saves every world, stops, and starts again as the new version.
5. The new version brings every world forward to itself before anyone's let in, then says it's
   running.

If the new version fails to start or to bring a world forward (or says nothing for 3 minutes), the
server goes back to the version before, puts the settings and every world back from the backups
made in step 3, and the page says why. The version before stays until the next update. The menu-bar
app says **Updating** meanwhile. As it's the same Node, macOS's firewall shouldn't ask again; if
it does, allow it.

A server run from **a copy of the repository** shows the commands instead (`git pull`, then start
it again).

### Releasing

Nobody has to: the **Mac app** workflow (`.github/workflows/mac.yml`) releases each change to
`main` that changes what the app holds (the game, the server, the app). It builds the app on
GitHub's Macs, tests it (opened, its server answering, quit with every world saved; the installer
run each way it installs), then publishes it as a GitHub release tagged `server-v<version>`: the
app's zip (`Pellagos-Server-<version>-arm64.zip`, which the Mac installer installs) and the server's
archive (`pellagos-server-<version>.tar.gz`, which servers update to), with notes from the pull
requests merged since the release before. The version is `package.json`'s major and minor and the
count of `main`'s commits (2.0.4123), so each is newer than the last; bump the major or minor in
`package.json` to say a release is a big one. The newest ten releases are kept. **Run workflow**
on the Actions tab (Mac app, on `main`) releases `main` as it is.

GitHub keeps each release file's SHA-256, and the installer and servers check what they download
against it: that's what they trust, the project's releases on GitHub.

**The release key** (optional) adds the project's own signature, which servers then require. Once:
`npm run release-key -- --new ~/pellagos-release-key.pem` makes an Ed25519 key pair: the private
half where it's told (never in the repository; keep a copy elsewhere too), and the public half in
`server/update/release-key.pem`, to commit. Put the private half's text in the repository's Actions
secret `PELLAGOS_RELEASE_KEY`, and the workflow signs each release's archive
(`pellagos-server-<version>.tar.gz.sig`). A server with the public half updates only to a release
the key signed; one made before the key was goes on checking GitHub's SHA-256.

## Where things are

The data folder is `~/Library/Application Support/io.github.hoffspot.pellagos-server` on a Mac,
`~/.local/share/pellagos-server` on Linux (or under `$XDG_DATA_HOME`), and
`%APPDATA%\Pellagos Server` on Windows.

```
VERSION                  how the folder's laid out, and the server that laid it out
server.json              the settings
secrets.json             the admin key's and creator keys' hashes (never a key as it is)
identity.key             the server's identity (the key it proves its id with)
certificates/            its certificates, and the DNS host's token where there's no Keychain
journal.log              what's happened to the server
worlds/<id>/             each world: world.json, state/ (its save and autosaves), heroes/,
                         access.json (its keys' hashes, players, bans), journal.log
backups/<id>/            each world's backups; backups/server/ the server's own
versions/                versions installed by updates (current.json, last.json)
```

Back it up with the rest of the computer. The Mac app's log is in
`~/Library/Logs/io.github.hoffspot.pellagos-server/server.log`.

## How it keeps up

Each running world steps 20 times a second in a thread of its own, about 110 MB when it's started
and more as its players go further. **Health** shows each world's steps (the mean, the 99th
percentile over the last minute, the worst) and memory, and the server's. A step over 50 ms is
a step late.

`npm run soak:server` runs a world server with 8 players in Node, each playing by itself, for two
hours, and says whether the world's memory stayed flat after the first hour (no more than 15% above
where it stood then) and whether every minute's 99th-percentile step stayed under 50 ms once the
players were all in. Run it with nothing else on the computer: the players' copies of the world
share its cores (they're run at a lower priority, as if each were on a device of its own). Each
minute it says how many are in the world's battle, how busy the world's thread was, and how many
tiles of buildings' insides it baked ahead (a few as players come near new buildings, none once
they've stayed). On a 4-core Linux machine, with 8 players each in their own people's town and
each starting a field battle every four minutes, the world took 136 MB an hour in and 130 MB at
the end, its steps 4.4 ms on the mean and 30.4 ms at the worst minute's 99th percentile, its
thread a fifth of a core.

## When something's wrong

| What | What to do |
| --- | --- |
| Players on the Wi-Fi can't reach it | macOS's firewall: allow "node" (System Settings › Network › Firewall). Use the address on the Overview, not `localhost` |
| A player's told the server plays an older or a newer version of the game | Their game and the server play different versions (players' games and the server must agree). The game from the server itself always matches: they open it from the server's address (its link in Worlds on servers). If the server's the older, **Update** brings it up to date; if theirs is, reloading the page does |
| It's not in the game's Nearby list | Bonjour is off, or macOS refused Local Network (the page says so). Add it by address |
| "The data folder … is at version N, written by Pellagos server X" | A newer server wrote it. Use that version or later, or restore the backup made before the upgrade |
| A world "can't be carried on" | None of its saves read, or it was saved by a version of the game older than this one can bring forward. Restore a backup, or **Start it afresh** (its Backups tab): its land made again from its seed, its war and heroes kept |
| An update was rolled back | Settings › Updates says why. Everything is as it was; the journal (Activity) has it too |
| The internet can't reach it | The internet panel's **Tested from outside**, and the router's state. Behind CGNAT, use Tailscale Funnel |
