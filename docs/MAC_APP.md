# Pellagos Server for the Mac

Pellagos Server is a small app that sits in the Mac's menu bar and runs the world server. The
world server keeps worlds for players to come and go in, on the Wi-Fi and, once it's set up, from
the internet. It's the same server as `npm run world-server` runs from Terminal, with Node and the
game inside the app, so nothing else needs installing (generated/world_server_plan.md §11,
Phase 2).

It needs a Mac with Apple silicon, on macOS 13 or later. It's made for macOS 27, which runs on
nothing else.

## Installing it

The installer, `scripts/install-mac.sh`, does it from Terminal (Applications › Utilities ›
Terminal). Paste this line, press Return, and wait for it to say it's installed:

```sh
curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash
```

It finds the project's newest release, downloads the app, checks it, puts it in Applications and
opens it. Nothing else is needed: Node and the game come inside the app. It asks for no password,
and it never uses `sudo`: if Applications can't be changed from your account, the app goes in
the Applications folder in your home folder instead. When it's done, the app's dot is in the menu
bar; what macOS asks next is [below](#what-macos-asks-next).

**Before the project's first release**, or to build it from the source yourself, the installer
builds it on this Mac. That needs Apple's Command Line Tools, which are free (about 1 GB). If
they're missing, the installer opens their installer and asks you to run it again once they're in:

```sh
xcode-select --install          # Apple's Command Line Tools, once
curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash -s -- --build
```

That downloads the project's source (about 40 MB) and builds the app, which takes a few minutes. The
first build also downloads Node from nodejs.org, checked against the SHA-256 kept in
`scripts/build-mac-app.js`. It uses the Node already on the Mac instead, if that's version 22 or
later. From a copy of this repository, `scripts/install-mac.sh --build` builds that copy.

**From a zip you have**: a release's `Pellagos-Server-<version>-arm64.zip`, or the **Mac app**
workflow's (the repository's Actions tab: Mac app, the latest run, `pellagos-server-mac` under
Artifacts):

```sh
curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash -s -- --zip ~/Downloads/Pellagos-Server-2.0.0-arm64.zip
```

Each way, the installer:

- checks the Mac: Apple silicon, macOS 13 or later;
- checks a release's zip is the one GitHub has (the SHA-256 GitHub keeps for each file of a
  release), and that the app in it is Pellagos Server (its bundle id), unchanged since it was
  signed (`codesign --verify`); anything else, it refuses, and leaves the app there as it was;
- stops Pellagos Server if it's running, as Quit does: its server first, which saves every world,
  then the app;
- puts the new app in place of the old one and opens it. Your worlds and settings aren't touched:
  a newer server brings them forward as it starts.

Run it again to update to the newest release, the same way: a new app in place of the old one.

| Add after `bash -s --` | Does |
| --- | --- |
| *(nothing)* | The newest release |
| `--version 2.1.0` | That release |
| `--build` | Built on this Mac from the project's source (`--ref <branch or tag>` for another than `main`) |
| `--zip <file>` | A zip you have |
| `--to <folder>` | Into that folder, not Applications |
| `--no-open` | Not opened once it's installed |
| `--uninstall` | Stopped and taken away; its worlds kept ([below](#updating-and-taking-it-off)) |
| `--help` | All of these |

**Why no Open Anyway.** A file downloaded by a browser is marked as downloaded, and macOS
checks an app with that mark with Apple before it opens it. Pellagos Server is signed, but not with
an Apple Developer ID (that costs $99 a year, and the project chose not to pay it), so macOS won't
open it until you say so in System Settings (Open Anyway, below). The installer downloads the app
itself, with `curl`, so it isn't marked. A zip given with `--zip` has the mark taken off once the
app in it has been checked. Either way, what you're trusting is the project's releases on GitHub,
or its source if you build it.

**By hand**, without the installer: open the zip, move **Pellagos Server** into Applications, and
open it with Open Anyway.

## Opening it by hand the first time: Open Anyway

The app is signed "ad hoc": signed, but by no one Apple knows. Opened from a zip downloaded in a
browser, macOS won't open it the first time until you say so. Since macOS 15, Control-click ›
Open no longer does this; it's done in System Settings:

1. Double-click **Pellagos Server** in Applications. macOS says it was "Not Opened", because Apple
   can't check it. Click **Done**, not Move to Trash.
2. Open **System Settings › Privacy & Security**, and scroll down to **Security**. It says
   "Pellagos Server" was blocked to protect your Mac. Click **Open Anyway**. The button is there
   for about an hour after step 1; if it's gone, do step 1 again.
3. Give your password or Touch ID, then click **Open Anyway** once more.

It opens from then on with a double-click, until it's replaced with a newer one (below).

## What macOS asks next

- **Incoming connections.** If the Mac's firewall is on (System Settings › Network › Firewall),
  macOS asks whether "node" may accept incoming network connections. That's the server inside the
  app: click **Allow**, or players can't reach it. It may ask again after an update.
- **The local network.** macOS asks whether Pellagos Server may find and connect to devices on
  your local network. Click **Allow**. The server uses it to show itself to players on the Wi-Fi
  (Bonjour), to find other Pellagos servers nearby, and to ask the router to let players in from
  the internet. Playing needs none of it: players who type the server's address get in either
  way. If you said no, turn it on in **System Settings › Privacy & Security › Local Network**;
  the management page says when macOS has refused it.

## The menu

The dot in the menu bar says how the server stands:

| Dot | Means |
| --- | --- |
| ○ an empty circle | Stopped |
| a moon in a circle | Running, nobody in: the Mac can sleep as it usually does |
| ● a filled circle | Players are in: the Mac is kept awake for them |
| … in a circle | Starting, or saving every world and stopping |

Its menu says the same in words (and **Updating** while it starts again as a new version), then:

- **Open the management page.** The server's own page, in your browser (`http://localhost:8481`
  on this Mac, no key needed): worlds, keys, players, backups, settings, the internet.
- **Stop** (or **Start**). Stopping saves every world first. Players in are sent out.
- **Run at login.** The app starts when you log in, and macOS starts it again if it ever fails
  (not after you Quit it). macOS says "Background Items Added"; if it asks, allow it in **System
  Settings › General › Login Items & Extensions**.
- **Quit.** Saves every world, stops the server, then quits. Logging out and shutting down do the
  same.

**Sleep.** While anyone is in a world, the server keeps the Mac awake (`caffeinate`), and lets it
sleep again when the last player leaves. It never changes your Energy settings. A MacBook on
battery, or with its lid closed, may sleep anyway: keep it plugged in and open while people play.

**Where things are.** Worlds and settings are in
`~/Library/Application Support/io.github.hoffspot.pellagos-server`, the same folder the server
uses when run from Terminal. Back it up with the rest of your Mac. What the server says (and
why it stopped, if it ever does) is in `~/Library/Logs/io.github.hoffspot.pellagos-server/server.log`.
The app and the Terminal server use the same ports (8480 for players, 8481 for the page), so run
one or the other.

## Updating, and taking it off

The management page says when a new version is out (Settings, Updates), and **Update** installs
it: every world is backed up first, the new version is unpacked beside the app in its data folder
(the app itself isn't changed, so its signature stays as it was), and the server starts again as
it, bringing every world forward. If it can't, it goes back to the version before, with everything
as it was. The menu says **Updating** meanwhile. [SERVER.md](SERVER.md#updating) has the whole of it.

The installer puts in a new app too ([above](#installing-it)): the newest release, a zip, or one
built on the Mac. So can you, by hand: Quit the app, put the new one in Applications in place of the
old, and open it. Either way its worlds carry on: a newer server brings them forward as it
starts. As it's a new app to macOS, the firewall and the local network may ask again.

To take it off, turn **Run at login** off in its menu, then:

```sh
curl -fsSL https://raw.githubusercontent.com/hoffspot/conquest/main/scripts/install-mac.sh | bash -s -- --uninstall
```

That stops it (every world saved) and takes the app away. Or, by hand: Quit, and move the app to
the Trash. Either way its worlds stay in the folder above until you delete that too.

## Without the app: Terminal and Homebrew

The server runs from a copy of this repository too: `npm run world-server` (contribution.md).

**Homebrew** has it as a formula, `pellagos-server`, in the project's own tap. A formula isn't held
back by Gatekeeper as an app is:

```sh
brew install hoffspot/pellagos/pellagos-server
pellagos-server                         # in Terminal; or, at login and kept running:
brew services start pellagos-server
```

The tap is published by hand, once for each version (the workflow builds what's needed but
publishes nothing):

1. Run the **Mac app** workflow (Actions, Mac app, Run workflow) and download its
   `pellagos-server-mac` artifact.
2. Make a release tagged `server-v<version>`, with `pellagos-server-<version>.tar.gz` attached.
3. Put `pellagos-server.rb` in the tap, the repository `hoffspot/homebrew-pellagos`, as
   `Formula/pellagos-server.rb`.

## Building it

On a Mac with Xcode, or its Command Line Tools:

```sh
swift build -c release --arch arm64 --package-path mac
npm run build:mac -- --executable "$(swift build -c release --arch arm64 --package-path mac --show-bin-path)/PellagosServer"
```

That makes `dist/Pellagos Server.app`, signed ad hoc, its zip, the server's archive and the
formula (`scripts/build-mac-app.js` says what's inside). The **Mac app** workflow does the same on
GitHub's Macs, then opens the app, sees its server answer, quits it, and installs and tests the
formula.

Or build it and install it in one go: `scripts/install-mac.sh --build` ([Installing it](#installing-it)).

The app (`mac/`) is small: `ServerProcess.swift` runs the bundle's Node on
`server/world.js --app` and reads how it stands from the lines it prints (`@pellagos {...}`), and
`LoginItem.swift` registers the bundle's launch agent with `SMAppService`, which launchd runs with
`ProcessType` Interactive (not throttled) and `KeepAlive` (started again if it fails).

## Checking it on a Mac

The **Mac app** workflow runs the installer on GitHub's Macs each way it installs (a zip marked as
downloaded, a release, built there) and takes it away again. GitHub's Macs can't answer macOS's
questions or sleep, so the owner checks these by hand on macOS 27.0.1, with each new version of
the app:

- [ ] **The installer.** In Terminal, the installer's line (above): it installs the newest
      release, says so, and the app opens with no Open Anyway. Run again, it stops the running
      app (its worlds saved) and puts the new one in. `--uninstall` takes it away.

- [ ] **First launch.** The zip downloaded in Safari, the app moved to Applications and opened
      with Open Anyway (above). The menu-bar dot shows; **Open the management page** opens it.
- [ ] **The firewall.** With the firewall on, the prompt for "node" appears; once allowed, a
      phone on the Wi-Fi reaches `http://<the Mac's name>.local:8480`.
- [ ] **The local network.** The prompt appears; once allowed, the server shows on another
      Mac's server page under Nearby. Refused, the management page says so, and play carries on.
- [ ] **Run at login.** Turned on, then the Mac restarted: the app is in the menu bar again, and
      in Login Items & Extensions. Quit, it stays quit; ended with `kill -9`, it's back within
      seconds.
- [ ] **Sleep.** With nobody in, the Mac sleeps as it's set to. With a player in,
      `pmset -g assertions` lists `caffeinate` (PreventUserIdleSystemSleep), and the Mac stays
      awake; the player leaves, and it's gone.
- [ ] **Quit saves.** Play in a world, Quit the app, open it again: the world is as it was.
