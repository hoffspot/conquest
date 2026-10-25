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

- **Overview.** Its name (the computer's own, unless it's been given one in Settings), its id
  (players' games check it's the same server each time), its addresses on the Wi-Fi with QR
  codes, how long it's been up, how many worlds it runs at once, the admin key, and the internet
  (below).
- **Worlds.** Each world, how it is ("Running: 3 players, day 4, 14:00", "Set aside: saved",
  "Offline"), and what can be done with it: start it, set it aside (everyone in it is sent out and
  it's saved), **take it offline** and **bring it online** (below), save it now, its settings,
  keys, players and backups, export it, delete it (its name typed).
- **New world.** Its name, seed and home people, what it does with its players' characters
  (below), its rules, and **Or bring a world in** (below).
- **Settings.** The server's settings, **Updates** (below), and creator keys: whoever holds one
  makes worlds of their own here, and owns them. First among the settings is **the server's
  name** as players see it: "Pellagos Home Server", say, rather than "Tom's Mac mini". Left
  empty, it's the computer's own. Changed, it's the name at once wherever it's shown: the game's
  lists of servers and its **Invite others** ("Your world's open to others through Pellagos
  Home Server"), the title's "Worlds on Pellagos Home Server", Bonjour on the Wi-Fi (other
  servers list it under its new name within a few seconds), this page, and the name of the
  server's archives. A game already open picks it up the next time it asks the server.
- **Activity** (what's happened, the server's and each world's) and **Health** (each world's
  steps and memory, and the server's).

## Worlds and who comes in

A world is reached with a **key**. Making one gives two: the **owner's** and the **players'**.
Keys have a role:

| Role | May |
| --- | --- |
| Owner | Everything: its settings, keys, players, backups; pausing it for everyone, from the game's menu; the debug commands, if its rules allow them |
| Trusted | Play, and give others keys, if its rules allow it |
| Player | Play |

A world has at most 10 keys that work at once. A key can be revoked, and everyone who came in with
it is sent out. Instead of a long key, a **short code** (8 letters and digits, for saying aloud or
typing on a phone) works once. Whoever comes in is given a **ticket**, kept by their game, so they come back
without the key. A lost ticket is given again from the world's Players tab; the old one stops
working. A player can be banned (by their ticket and their identity, and their address for 24
hours) and let back.

**Players and their codes** (client/js/core/player.js, client/js/app/you.js). Each player has an
identity of their own, the same on every server, kept on their device: a secret key the game makes
for them (Ed25519), and their **player id**, worked out from its public half: a UUID (version 8:
the first 16 bytes of the key's SHA-256), lowercase, the same every time, for a database to keep as
its own `uuid` type and index. They go by a name they choose (2 to 24 letters, digits and spaces).
Coming into a world (`POST /enter`, a short code redeemed), the game shows `player`: their public
key, their name, the moment, and a signature over the server's own id, the moment and the name
(`pellagos.player.1`). The server takes it only if the signature holds, for its own id, within 10
minutes of its clock, and never shown before (each is remembered while it's fresh); else they come
in by their key and ticket alone, as before identities. Taken, the world's player is known by it
from then on (`access.json`: `identity`, `playerName`):

- **Coming back with it** (on another device, with their code), they're the same player, with
  their heroes, ticket or none, as long as a key they came by works (as a ticket alone is).
- **A ticket from before identities** is linked to theirs the first time they show both.
- **A ticket and another identity** (they lost their code, and the owner gave them a new ticket):
  known by the new one from then on.
- **In another world** they're a player of that world's, known by the same identity.
- The Players tab names them by the name they go by, and shows their player id.

**Coming in again while they're in** (on another device, or after a crash): their hero in the world
is theirs to take over where it stands (docs/WAR.md *Coming in again on another device*); the
other device is sent out (`closed elsewhere`). A link that drops without saying it's leaving (or
goes silent for a minute: server/play.js `PLAY_LIMITS.timeout`) keeps its place for five minutes
(`grace`), to come back to on a new link; not back by then, its place is let go of and its player
is out of the world, their hero kept as on any exit. The game itself, started again within half an
hour after a crash or a reload, goes straight back in as the same hero (docs/GAME.md, *Back into a
world*).

Their **code** is their secret key written out (nine groups of six letters and digits, the last
two catching a mistyped one), to carry them to another device: the game's **You** panel shows it,
copies it, saves it as a file, or shows it as a code to scan, and takes one from another device.
Anyone with it can play as them, so it's theirs alone to keep.

**What a world does with its players' characters** (`storage/worlds.js` `CHARACTER_RULES`: its
`characters`, kept as the heroes mode and first-hero rule each stands for, `RULE_MODES`). The game
says which on each world's card and tells players plainly before they choose who goes in:

| Rule | Who goes in | Kept | Leaving |
| --- | --- | --- | --- |
| **Made here** (`own`) | One of theirs made there (up to 6 a player), or a new one, made there with the look of who they came as | By the world: its own | **Take one home**, asked first: it leaves the world for good (the server forgets it) and is kept on their device |
| **Copied in** (`copies`) | One of their copies there ("Ada · Fernhollow's copy"), a character on their device copied in (asked first), one from a character file (asked first), or a new one | By the world. A copy is the world's own: what it does there never goes back to the character on their device | Never: a copy stays in the world it was copied into |
| **Visiting** (`visiting`) | One of the characters on their device, or a new one made first | Who they are and what they carry: on their device, the one kept as they play, brought each time. What the world knows of them: by the world (Visitors, below) | They leave with the player |

- **Copied once.** A character is copied into a world once: by its own id (below), by anyone, on
  any device. Asked again, the world says so ("That character's been copied into this world
  already"), and the game shows them as copied in already.
- **Changed only while nobody's in it**: offline (below) or set aside. Characters a world keeps
  stay on the server if it's switched to visiting, and are there again if it's switched back;
  copies already in it stay copies.
- **Made** with a rule (the game's Make a world, the management page's New world: `characters`),
  or without one, as kept by the world, made there.
- **What a world takes of a character brought to it** (visiting, or copied in): who they are and
  what they carry (their look, their own id, what they've grown into, their gear and gold). What
  another world knew of them (what its folk know of them, where they stand and the requests they
  carry, their followers, where they were) stays in that world: each world has its own.
- **What's the player's own of a hero** (client/js/core/host.js `OWN`): their action wheels and
  quick actions, where they've pinned the world map and their markers on it, the last messages
  they were told, what they've been told once, and their settings for how they play (auto-snag
  and what it takes, the target lock, saying no to summons and invites, and the camera:
  client/js/app/save.js `PLAY_SETTINGS`). A world that keeps its heroes (made there, or copied
  in) keeps all of it with each, as their game says it's changed, in its saves and in the hero's
  file, and gives it back each time they come in, on any device or browser (the settings taken
  up by it, as they last set them); only their own game is told it. A hero kept before it did
  comes in with the wheels and quick actions of the character their device last played, and the
  device's settings, kept from then on. A visitor's wheels, quick actions, messages and
  what they've been told once are their device's, going with them from world to world; the world
  remembers their pin and markers on its map, with what else it knows of them (Visitors, below).

**Visitors** (`storage/visitors.js`). A world whose players bring their own remembers what it knows
of each who's visited it, for the player who brought them and by their character's own id: what
its folk remember of them and what they learnt there, what they found of it, where they stand
with its peoples and the requests they carry, their followers there, where they were and how
when they left, and where they'd pinned its map and their markers on it
(`visitors/<player>/<character id>.json`). The next time that player brings that
character, they come back to all of it, with what they carry as their device has it now; another
player bringing a character with the same id gets none of it (others see a character's id as they
play beside them). What they carry is never kept by the world: their game keeps it as it changes,
and it goes with them when they leave. A world's backups, its export and the server's archive
carry what it remembers of its visitors. A world a player opens to others from their own device
does the same for its visitors, kept on that device with the world (docs/GAME.md, "Characters and
worlds on this device"), up to twelve, the one gone longest forgotten.

**Offline for upkeep.** Its owner (on the management page, or the world's own endpoints) or the
server's admin **takes a world offline**: everyone in it is sent out ("The world's owner took it
offline"), it's saved and set aside, and nobody may come in, its owners neither, till it's
**brought back online**. Its card says so to anyone who lists it ("Offline for upkeep"), and its
journal when it went and came back. What it does with its players' characters is changed then.

**Heroes as files.** The heroes a world keeps can leave it as character files, the same files the
game's Characters on this device exports and brings in (`.pellagos-character`):

- A player **takes one home** from a world whose characters are its own, when they choose who
  goes in (**Take one home**), asked first: it's kept in their game, with a copy of the world (its
  land, its war as it was last saved, and its name) as one of the worlds on their device, to play
  by themselves or to bring into another world, and the
  world forgets it for good. Not a copy (a world that takes copies, a world's hero brought to the
  server, or one switched to its own since: a copy never leaves), and not while they're in the
  world on any device. Should their device not keep it (no room, or storage refused), the file's
  saved instead, so it's never lost.
- Where characters are copied in, a player can **copy one from a file** (**Copy one from a
  file**), as well as one their game keeps.
- The world's owner **exports a player's heroes** from the Players tab (**Export heroes**): every
  hero of theirs kept there, in one file, to give them or keep. It's a copy, for safekeeping: the
  heroes stay in the world.

**Each hero's own id** (client/js/core/guid.js): every hero a world keeps has one (`hero.guid`),
given when it's first kept, or the first time one kept before ids is given back. A hero brought
in from a player's game (their first, where the rules allow it; or the hero of a world brought to
the server, below) is a copy, the world's own from then on: an id of its own, and the one it was
copied from as its `origin`. A new hero made with the look of one a player has is new: an id of
its own and no origin. A visitor's hero, in a world whose players bring theirs, keeps its own id.

A hero kept by an older version of the game, or brought in from an older file, comes in as this
version plays them: whatever it no longer has (things, spells, skills, callings, a people or a
weapon) is left out or put right, and the world's journal says what. Brought in from a file, the
game says it first.

A world with nobody in it waits 2 minutes, then it's saved and **set aside**: it uses nothing
until someone comes in. Two worlds run at once by default (the page says how many the computer can
take); a third waits its turn. While anyone's in a world, the computer is kept awake.

Players add the server in the game's **Worlds on servers** (by its address, from an invite link or
QR code, or from the servers found nearby on the Wi-Fi), then come into a world with its key or
code, or make one with a creator key or the admin key, or bring one of their own (below). Opening
the game from the server's own address adds it by itself (Getting people in, below).

## Getting people in

The quickest way for each, the commonest first. An invite link opens the game from the server
itself, so a player's game is always the server's own version. Once the server's open to the
internet ([Reaching it from the internet](#reaching-it-from-the-internet)), the link carries its
internet address (`https://pellagos.duckdns.org:8480/…`, say) and works from anywhere. Until
then it carries the server's Wi-Fi address and works at home alone, and wherever it's shown, it
says so.

### Running the server

| To | Do this |
| --- | --- |
| Invite people into a world | The management page's **Worlds**, the world's **Invite players**: copy the link and send it, or let them scan its code. One link does for everyone you send it to. |
| Have a world anyone can drop into | The world's **Settings**, **Open to anyone** (below). Whoever opens the server's address sees it, and joins it with a tap. |
| Let a friend run a world of their own | **Settings**, **Creator keys**: make one and send it. In the game's **Worlds on servers** they **Make a world**, or bring one they've played alone (**Bring my world**), and own it. |
| Stop a link that's gone too far | The world's **Invite players**, **Replace the link**. The old one lets nobody else in. Everyone who came by it keeps their place, and comes back as before. |
| Keep someone out | The world's **Players**: **Send out**, or **Ban**. |

### Owning a world

In the game, in the world: the menu's **World**.

- **Invite link**: the world's link, copied at once, with its code to scan, **Share…** on a phone,
  and **Replace the link**. It's the same link the management page gives.
- **Open to anyone**: the switch (below).
- **Make a short code**: for someone who has the game open already, typed on the Worlds screen
  (**Enter a code**). It works once, for half an hour.

In the menu, with anyone else in the world: **Pause for everyone**. The world stops for all in it,
each told who paused it, till you resume; if your link drops meanwhile, it goes on for the others.
Nothing else stops a world anyone else is in. Alone in it, your menu stops it, and so does your
page hidden (its rule **Stopped while its one player's page is hidden**, on unless you turn it off).

### Playing

| You have | Do this |
| --- | --- |
| An invite link | Open it, or scan its code. The game opens from the server. The first time, you make a character for the world, then you're in. |
| Only the server's address (`pellagos.duckdns.org:8480`) | Open it in a browser: `https://` from the internet, `http://` on its Wi-Fi. The title shows the worlds on it. One open to anyone, tap and you're in; any other, ask its owner for the link. |
| Been in before | Open the server's address again (or the link): your world's on the title. Tap it. Your game keeps a ticket, on that device. |
| A new phone or browser | Ask the world's owner for the link again. Or, on the old one, Worlds on servers, **My servers and tickets**, and bring the code to the new one. |
| A short code | Worlds on servers, the server's **Enter a code**. |

The game's **Worlds Guide** (on its Worlds on servers screen) tells players all of this, with
examples of each kind of link, address and code, and what to do when a world won't join.

### Open worlds

A world **open to anyone** lets in whoever comes without a key. It's shown to everyone who opens
the server's address (as a listed world is), and joined with a tap. Each newcomer comes in by its
**open door**, a key of its own among its keys ("Anyone (an open world)"), and is given a ticket
like anyone else, to come back by. No more than 20 newcomers an hour come in by it, nor 3 from one
address, and bans hold as ever. Turned off, nobody new comes in without the link, and those
already in can still come back; to keep them out too, revoke the open door under its **Keys**.
Its owner turns it on or off from its Settings on the management page, or from the game's World
panel, whenever they like. The game's lists say which each world is: "Open to anyone: tap to
join", "Needs a key: ask its owner for an invite link", or "Offline for upkeep".

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

## Bringing your own world

Each world a player plays in alone is kept on their device (docs/GAME.md, "Characters and worlds
on this device"): its land (its seed), and the war going on in it. **Bring my world**, on the
server's card in the game's **Worlds on servers**, makes one of those a world of the server's. The
game says how, as it goes:

1. **Which world, as whom.** Each world on that device is listed with each of their characters
   who's been in it ("Thornvale, as Ada"): the one chosen goes with it. One on another device or
   in another browser is exported there while they're in it (Characters on this device, Export)
   and imported here first (Characters on this device, Import from a file): their world comes
   with them.
2. **A key that makes worlds here:** the admin key (on the server's Wi-Fi alone), or a creator key
   its owner made for them (Settings, Creator keys).
3. **Its name** (the world's, to start with), and whether others make new characters
   there (made here) or may copy one of theirs in (copied in).

The server makes a world with the same seed (its home people the character's), its war carried on as it stood, and
the rest made from the seed, as the game makes it each time it's loaded. Its heroes are kept by
the world, and a copy of the character is the first of them (it never leaves the world), put right as this version of the game plays
them, as a character file is (what changed is said to the player, and in the world's journal).
Whoever brought it is its first player, its owner, by the owner's key: their game keeps that key
and their ticket, says what came of it, and goes straight in to their character. The character on
their device is left as they were, and so is the world: from then on there are two of each.

It's refused, and nothing's made, for a key that makes no worlds; a game of another version than
the server's (the game says what to do: export the character while they're in it, open the game
from the server itself, import them there, and bring the world that comes with them from there); a character kept by a newer game
than the server plays (it updates itself overnight, or **Update** does now); or more than 16 MB
sent. (`POST /api/v1/worlds/bring`, the game's `ServerClient.bringWorld`: server/manage.js
`bringSolo`, server/reopen.js `importSolo`.)

## Players' own worlds

A player who opens their own game's world to others (the game's **Invite others**) can list it on
the server (its **broker**), and others join it point to point (WebRTC). When their games can't
connect directly, the server relays them, about 2 KB/s for each player who's joined. The
**broker** and **relaying** settings turn either off.

A world stays listed while its host's link is open. It's taken down at once when its host closes
it to others (the game withdraws it). Otherwise it's kept for a while, and those in it told it's
away (`server/broker.js` `BROKER_LIMITS`):
- **45 seconds** (`expire`) when the host's link drops without a word, to come back on a new one;
- **two minutes** (`reloading`) when it closes without withdrawing it (the host's page closing or
  reloading), long enough for the game started again to load the world and take the listing back
  under its code (docs/GAME.md, *Back into a world*). Taken back that way, afresh, those in it are
  told to come in again (`closed again`), and the game goes straight back in.

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
