# Pellagos: the netcode

How a world is played by more than one game. This is the document the scaling plan's `3-36`
asks for (generated/multiplayer_scaling_plan.md): it will stand in place of the lockstep sections
of [WAR.md](WAR.md) (*Playing together (M11)* onward) once lockstep is deleted. Until then both
netcodes ship side by side, WAR.md stays the full account of each part, and this says how they
fit together, what a change must keep to, and what the deletion will take out.

## One authority, two ways of telling it

A world has one authority, `Host` (`client/js/core/host.js`): on a world server, in its world's
thread; in a browser, in the page that hosts. Nothing else decides what happens. A game that
joins asks (commands) and is told. How it's told is the world's **netcode**
(`NETCODES` in `client/js/core/netplay.js`):

| | `lockstep` | `replicated` |
|---|---|---|
| What a game holds | A copy of the whole world | A mirror of what's near its hero |
| What it's sent | The world once (a snapshot), then every step's commands (`ops`) | A summary once, then a frame of bytes each step (`view.js`) |
| How it keeps up | Plays the same steps; a checksum every fifth of a second; sent the world again if it strays | Plays each frame as it comes; asks for its view again (`again`) after a gap |
| The link | `Joining` | `Viewing` (`client/js/core/viewing.js`) |
| The host's side | `OpsFeed` in `Hosting` | `ViewFeed` in `Hosting` (`client/js/core/viewfeed.js`) |
| A world's most players | 8, always | 8 today; more only by `3-33`'s rule (`server/access/cap.js`) |
| Called, to a host | Classic | (Classic off) |

`Hosting` runs both feeds; a world is played one way at a time. The switches:

- **A world on a server**: its `netcode` setting; the server's `replication` setting (off, dark,
  on) is the switch over all of them; `newWorlds` is what a world made there is when it isn't said
  (`3-34`). docs/SERVER.md, *How a world's played, and the replication switch*.
- **A world hosted in a browser**: Classic, per world, in the invite dialog (`3-35`). A joiner
  asks the host how it's played before its hello (`how`, `played`).

What a game says it can play is `speaks`, in its hello and a server's `/enter`; one that can't
play a world's way is refused in words (`netcode`).

## What a change must keep to

CLAUDE.md, *Multiplayer: two netcodes side by side*, is the rule; contribution.md, section 3,
has the version numbers. In short:

- A change to what's replicated changes lockstep's op and the view's schema together.
- `NET_VERSION` for what both share or lockstep says; `VIEW_VERSION` only with a frame's bytes;
  no `SNAPSHOT_VERSION` bump for replication.
- A change to the transport is tested in both netcodes.
- Everything new is behind a switch that defaults to today's behaviour, with an expiry test.
- No name is used again.

## The tools, and which netcode each leans on

| Tool | Leans on | After lockstep |
|---|---|---|
| `npm run soak` (`scripts/soak.js`): the cross-engine soak | Lockstep by default: copies kept to the host's, resyncs an hour, the same step for a player sent out. With `--netcode replicated` (this slice): frames kept up with, no faults, and the seeded ground the same in every engine | Replicated only |
| `npm run soak:server` | Lockstep bots, and thin ones; `--replication dark` measures the views beside it | Its resync criterion goes |
| `npm run soak:view` | Replicated | Stays |
| `npm run record:view`, `test/fixtures/views/` | Replicated | Stays |
| `npm run load`, `npm run check:motion` | Neither: the world's own cost, and motions | Stay |
| `?shadow`, `?mirror` | Lockstep's copy, to check the view against it | Go with the copy |
| The checksum scenarios and snapshot fixtures | The world's determinism, which a server's saves and the forecast still need | Stay, re-aimed at saves |

## What deleting lockstep takes out (the plan's `3-40`)

Not done, and not to be done until gate (d) is met and the owner says so. In four or five pull
requests, each leaving the game playable:

1. The toggles: a world's `netcode`, the server's `replication` and `newWorlds`, a hosted world's
   Classic. Their names are never used again.
2. `OpsFeed`, `ops`, `state` and the welcome's snapshot for joiners; `Joining` folded into
   `Viewing`.
3. The client's replay: a joined game's copy of the world, its checksum and catch-up, the motion
   streams.
4. Shadow mode and `?mirror` (they compare a view with a copy that's gone).
5. The soak's resync criterion, and the lockstep sections of WAR.md, this document in their place.

What stays: `Host`, its commands and its determinism (saves, the forecast, a server's world
thread), the relay and the broker, and solo play, which never was lockstep.

## Gate (d), as it stands

| It asks | Today |
|---|---|
| No lockstep world on the owner's server | Every world there is lockstep |
| Classic under 5% of hosted worlds on the broker's count for four weeks | The count exists (`pellagos_hosted_worlds`, `3-35`); Classic is the default; no history kept yet (`3-39`) |
| Every tool that leaned on lockstep replaced | The soak can run replicated (this slice); the rest as the table above |
| A tagged last-lockstep release | None |
| A notice in the game for two releases | Built, off (`LOCKSTEP_ENDS`, this slice): turned on by setting its date |
