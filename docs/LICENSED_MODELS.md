# Licensed models

Some of the game's models aren't free to reuse: they were bought, and are in the game with the
seller's permission, or under a licence that gives it. Today they're the Dreadthorn, HuyKhoi2407's
Dreadthorn Dragon; the werewolf, Fab's Werewolf - Mythical Creature, with its five other skins; and
three not in the game yet: the centipede, Fab's Centipede Monster-V2; the Ant Monster, Fab's Ant
Monster V1b; and the ant, Fab's Ant V2 (`client/models/beasts/LICENSE.md`). This page is how such
models are kept out of anyone else's hands, as far as a game played in a browser can, and what the owner sets up for it.

**Status: done.** The owner set the private repository up on 16 October 2026 (*Setting it up*,
below), and the Dreadthorn's model moved into it: scrambled, with whose it is stamped in it. It's
no longer in this repository (only in its history).

## What it does, and what it can't

A model that's drawn in a browser can be copied: the browser has to download it to draw it, and
anyone with its developer tools can save what it downloaded. So nothing here makes a model
impossible to take. What it does:

- **Keeps licensed models out of the public repository.** They're in a private one,
  `hoffspot/conquest-models`. Browsing this repository, cloning it, forking it, *Download ZIP* and
  the scrapers that harvest 3D files from GitHub in bulk get none of them.
- **Scrambles them**, everywhere they're served: the game's site, the Mac app, and a world
  server's copy. A scrambled file isn't a GLB: no 3D tool opens it, and nothing looking for models
  by their file type finds it. The game unscrambles it as it reads it (*Scrambling*, below).
- **Says whose they are**, in the model itself and beside it, so a copy can be shown to be ours
  and taken down.

| Where | Has the licensed models? |
| --- | --- |
| This repository, its clones and its forks | No |
| `hoffspot/conquest-models` (private) | Yes: the owner, and the read-only key the builds use |
| CI, on a branch pushed to this repository | Yes, fetched with the key |
| CI, on a pull request from a fork | No: GitHub doesn't give a fork's pull request the repository's secrets |
| The game's site (GitHub Pages) | Yes, scrambled |
| The Mac app (its releases) | Yes, scrambled |
| Someone's own copy, without access to the private repository | No: each creature's stand-in is drawn instead |

A model already committed here stays in this repository's history. The Dreadthorn's model is in
it from its first commit until the commit that moves it out. Taking it out of the history would
mean rewriting `main`, which breaks everyone's clones and branches, and copies already made keep
it anyway, so the history is left as it is.

## How the builds get them

The private half of a key is kept in this repository as the secret `MODELS_DEPLOY_KEY`. The
public half is on `hoffspot/conquest-models` as a read-only deploy key: it can read that one
repository and nothing else, and it can't change it.

Every workflow that needs the models starts with one step, `.github/actions/licensed-models`. It
checks the private repository out into `.models` with the key, and puts its files in place under
`client/` (`node scripts/licensed-models.js place .models`), each checked against the hash and
size the catalog keeps. That's before it tests or builds:

- `ci.yml`: the `test` job and the `e2e` jobs;
- `pages.yml`: before the tests and *Put the site together*, so the site has them;
- `mac.yml`: before the app's built, so the app has them.

The private repository is laid out as `client/` is: its `models/beasts/dreadthorn.bin` is put at
`client/models/beasts/dreadthorn.bin`. git ignores both that and `.models` (`.gitignore`), and
`test/licensed.test.js` checks it does.

**The tests that need a licensed model** (reading the Dreadthorn's file, or drawing it) ask
`licensedModelsHere()` (`scripts/licensed-models.js`):

- **In CI on this repository**, once the step's put the models in place, it sets
  `LICENSED_MODELS=required`: a missing one fails the run. They're never left out there.
- **On a fork's pull request**, which GitHub gives no secrets, the step leaves the models out,
  with a notice, and those tests say they're left out. A maintainer brings such a pull request
  into a branch here before it's merged. Anywhere else, no key fails the job.
- **On someone's own copy**, `npm run models:fetch` fetches the models with their own access to
  the private repository. Without it, the game draws the stand-ins, and those tests say they're
  left out for want of them.

The catalog (`client/models/assets.json`, and the `client/js/app/assets.js` made from it) keeps
each licensed file's hash and size. So the catalog's the same with the files or without them, and
`npm run build:manifest` gives the same result for everyone. Where the file is here, it's checked
against them, and one that differs fails the build.

## Setting it up (the owner, once)

Done on 16 October 2026; kept here for doing it again (a new repository, say). About fifteen
minutes, and nothing costs money: a private repository is free on GitHub. Do it on a computer of
your own (not one whose security software stops files being shared), in a browser signed in to
GitHub as hoffspot, with a terminal: on a Mac, press **⌘ Space**, type `Terminal` and press
**Return** (on Windows, PowerShell, from the Start menu). Use a computer's browser: GitHub's phone
app can't change these settings.

Where each half of the key goes:

| Half | Goes to | Where | What it means |
| --- | --- | --- | --- |
| Public (`conquest-models-key.pub`) | `hoffspot/conquest-models` | *Settings → Deploy keys* | Whoever holds the matching private half may read this one repository |
| Private (`conquest-models-key`) | `hoffspot/conquest` | *Settings → Secrets and variables → Actions* | The builds hold it as `MODELS_DEPLOY_KEY`, to read `conquest-models` with |

Not your account's own SSH keys (your picture → *Settings → SSH and GPG keys*): a key there opens
every repository you can reach.

### 1. Make the private repository

1. Open `https://github.com/new`.
2. **Owner:** `hoffspot`. **Repository name:** `conquest-models`. The description can be empty.
3. **Private.**
4. Turn on **Add a README** (a tick box or a switch), so the repository has a `main` branch to start
   from. **.gitignore** and **license**: none.
5. **Create repository.**

A Claude session then attaches it (`add_repo`) and reads it back: there, private, its `main`
branch. If it can't reach it, the Claude GitHub App needs it: `https://github.com/settings/installations`,
**Configure** beside Claude, then under **Repository access**, with **Only select repositories**,
add `conquest-models` and **Save** (with **All repositories**, there's nothing to do). Failing
that, reconnect GitHub at `https://claude.ai/connect-github`, or start a new session with both
repositories chosen.

### 2. Make the key pair

In the terminal, paste this and press **Return**:

```sh
ssh-keygen -t ed25519 -C "conquest builds: read conquest-models" -f ~/conquest-models-key
```

- At `Enter passphrase (empty for no passphrase):` press **Return**, typing nothing; at
  `Enter same passphrase again:` **Return** again. No passphrase: the builds use the key with
  nobody there to type one.
- If it asks `Overwrite (y/n)?`, there's an old key of that name: `n`, and find out what it is
  first.

It says where it saved the two files, then `The key fingerprint is:` and a line starting
`SHA256:`, then a box of symbols. The `SHA256:` line is the fingerprint: safe to share (it names
the key, but isn't one). Give it to the session, to check against in step 3. The two files:

- `~/conquest-models-key`, **the private half**. It's a secret: it goes only into GitHub's secret
  (step 4). Never into a chat, an issue, a commit or a pull request.
- `~/conquest-models-key.pub`, the public half. It isn't secret.

### 3. Give the public half to the private repository, read-only

1. Copy the public half: `pbcopy < ~/conquest-models-key.pub` on a Mac (it prints nothing); in
   PowerShell, `Get-Content $HOME\conquest-models-key.pub | Set-Clipboard`. (`cat` it to see it:
   one line, `ssh-ed25519 AAAA…`, ending `conquest builds: read conquest-models`.)
2. Open `https://github.com/hoffspot/conquest-models`, then its **Settings** tab (⚙, at the end of
   the row of tabs; in a narrow window, under **⋯**). In the menu down the left, under
   **Security**, **Deploy keys**. (Directly: `https://github.com/hoffspot/conquest-models/settings/keys`.)
3. The green **Add deploy key**.
4. **Title:** `conquest builds (read only)`. **Key:** paste (⌘V). It's the one `ssh-ed25519` line;
   if it's `-----BEGIN OPENSSH PRIVATE KEY-----`, that's the private half: clear it, and copy the
   `.pub` again.
5. Leave **Allow write access** unticked.
6. **Add key**, giving your password or two-factor code if GitHub asks.
7. Check its entry: the title, the fingerprint from step 2, and **Read-only**. (A session can't
   read a repository's deploy keys, so this check is yours.)

### 4. Give the private half to this repository, as a secret

1. Copy the private half: `pbcopy < ~/conquest-models-key` (no `.pub`); in PowerShell,
   `Get-Content $HOME\conquest-models-key -Raw | Set-Clipboard`. Don't `cat` it or paste it
   anywhere else.
2. Open `https://github.com/hoffspot/conquest`, its **Settings** tab, then in the menu down the
   left, under **Security**, **Secrets and variables**, then **Actions**. (Directly:
   `https://github.com/hoffspot/conquest/settings/secrets/actions`.) Not *Dependabot* or
   *Codespaces*.
3. On the **Secrets** tab, the green **New repository secret** (a repository secret, not an
   environment's).
4. **Name:** `MODELS_DEPLOY_KEY`. **Secret:** paste: several lines, from
   `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----`. If it's the one
   `ssh-ed25519` line, that's the public half: clear it, and copy without `.pub`.
5. **Add secret.** It's listed under **Repository secrets**; GitHub won't show its value again, to
   anyone, you included.
6. Clear the clipboard: `echo -n "" | pbcopy`.

### 5. Check the two halves match

A session can't read the secrets either, so it checks by using them: a pull request whose build
checks `conquest-models` out with the secret (the `test` job's licensed models step). GitHub lets
it only if the secret is the private half of the deploy key, so its passing proves steps 3 and 4.
Keep the key files until it has: if it fails, you can paste them again.

### 6. Delete the key files from your computer

```sh
rm ~/conquest-models-key ~/conquest-models-key.pub
ls ~/conquest-models-key*
```

The `ls` should find nothing (`no matches found`, or `No such file or directory`); in PowerShell,
`Remove-Item $HOME\conquest-models-key, $HOME\conquest-models-key.pub`. `rm` deletes outright, not
to the Bin. If a clipboard history app (Raycast, Alfred, Paste, Maccy, Windows' ⊞ V) kept the
private half, delete that entry too. A backup made since step 2 may hold a copy: it only matters
if someone's in your backups, and the key only reads one repository. GitHub has each half where
it's needed; if a key's ever needed again, a new pair is made (*Changing the key*, below).

### 7. What the session does then

1. Puts the licensed models in the private repository: scrambled, whose each is stamped in it,
   each with its `LICENSE.md`, laid out as under `client/`.
2. Opens the pull request that moves them out of this one: the licensed models step in `ci.yml`,
   `pages.yml` and `mac.yml`; the models out of this repository (from then on, not from its
   history); `npm run models:fetch`; the notice beside `LICENSE` that Apache 2.0 covers the code,
   not the licensed models; and `contribution.md` (the steps, and the settings table in section
   6).

No CI job is added or renamed, so the ruleset's required checks don't change.

## Adding a licensed model, later

1. **Check the licence first**, before anything's bought: it has to allow use in a game in a
   browser, in any engine (not "Unreal Engine only"). And either the licence itself allows the
   model to be served from the game's site as part of the game (Fab's Standard License does: a
   project may be distributed with its assets in it, never the assets on their own), or the
   seller agrees to it, as the Dreadthorn's did. The owner decides, never a contributor.
2. Convert it with `utilities/blenderpipeline` (its configuration in
   `utilities/blenderpipeline/private/`, which git ignores, with the bought files).
3. Scramble it, with whose it is: `npm run scramble -- <model.glb> <model.bin> --copyright "<the
   model, by whom, where it was bought; in Pellagos with permission; not free to reuse>"`. It
   prints the scrambled copy's size; its hash is the first 10 hex digits of its SHA-256.
4. Commit the scrambled copy to `hoffspot/conquest-models` where it goes under `client/` (a
   creature's in `models/beasts/`), with its `LICENSE.md` beside it: who made it, where it was
   bought, the permission, and "Don't copy it out of this game or use it in anything else."
5. In this repository:
   - its catalog entry in `client/models/assets.json`, marked `"licensed": true`, with its file's
     `path`, `hash` and `bytes`, and a label that names the seller and the permission;
   - its path in `.gitignore`, beside the Dreadthorn's (each file's: a model's skins are
     files of their own, in an entry of their own, `<id>-skins`);
   - its licence note under `client/` too, as `client/models/beasts/LICENSE.md` is (the model
     viewer links to it);
   - its credit in `README.md`'s *Credits and license*;
   - then `npm run models:fetch` and `npm run build:manifest`.

   `test/scramble.test.js` checks every model so marked is scrambled, and no other;
   `test/licensed.test.js`, that git ignores it.

## Remaking a licensed model

A remade model (new clips, say) goes into the private repository **under a new name**
(`werewolf-2.bin` after `werewolf.bin`), never over the old one: the builds check each file
against the hash the catalog keeps, so replacing it would break `main`'s builds and its site until
the change that uses it is in. So:

1. Scramble the new build as above, into the private repository under its new name, and commit
   it there beside the old one (its `LICENSE.md` saying so).
2. In this repository, the catalog entry's `path`, `hash` and `bytes` the new file's, and its path
   in `.gitignore` beside the old (which stays: a copy of it is left behind in everyone's
   `client/`, and mustn't be committed); `npm run models:fetch`, `npm run build:manifest`.
3. Once that's merged, delete the old file from the private repository.

Files that come out the same (a model's skins, which hold no clips) stay as they are: compare the
scrambled copy's hash with the catalog's.

## Changing the key

If the private half might have got out, or someone who could see it no longer should:

1. On `hoffspot/conquest-models`: **Settings → Deploy keys**, then **Delete** the old key.
2. Make a new pair, and add it, as in steps 2 to 6 of *Setting it up*. In step 4, the secret's
   row under **Repository secrets** has a ✎ pencil: **Update** it with the new private half
   (or a new secret with the same name, `MODELS_DEPLOY_KEY`, which replaces it).
3. Update the fingerprint in `contribution.md`'s settings table (section 6).

Builds between deleting the old key and adding the new can't fetch the models, so run them again
afterwards.

## Scrambling

Each byte of a licensed model's file is swapped for another, through a table made from a fixed
seed (a shuffle of the 256 values a byte can have). The same byte always becomes the same byte, so
what repeats in the file still repeats, and gzip, which GitHub Pages sends every file with, packs
it as small as the model itself. The game swaps the bytes back as it reads the file, a MiB at a
time with a turn between, so nothing else waits long; two bytes at a time, through a table of
every pair, for speed.

It's not a secret, and can't be: the game has to undo it, so anyone with the game's code can. It
stops a model being saved, opened or found as one, and no more.

- **The code:** `client/js/app/scramble.js`, used by the game, the build's scripts and the tests
  alike. The game's glTF reader (`world/art/engine/models.js`) unscrambles any file that starts as
  a scrambled GLB does (its `glTF`, scrambled), and reads any other as it is. So the model viewer,
  the labs and the game all read a scrambled model without being told.
- **Making a scrambled copy:** `npm run scramble -- <model.glb> <model.bin> --copyright "<whose>"`
  (`scripts/scramble-model.js`), which stamps whose it is in the model (its glTF asset's
  `copyright`, which 3D tools show) and checks the copy comes back as the model. It's named
  `.bin`, not `.glb`, as it isn't one.
- **Marked in the catalog:** a licensed model's entry in `client/models/assets.json` has
  `"licensed": true`. `test/scramble.test.js` checks each one so marked is scrambled and comes back
  a GLB, and that nothing else is scrambled.

### What it costs

Measured on 16 October 2026 with the Dreadthorn: 5.06 MB, and 3.3 MB gzipped, as GitHub Pages
sends it. In Chromium, at a desktop's speed, and with Chrome's CPU throttling slowing it 4 and 6
times as a stand-in for phones. Each time is the middle of 15 tries, each way timed on its own:

| | Desktop | 4 times slower | 6 times slower |
| --- | --- | --- | --- |
| Reading the model as it is, from the downloaded file to the model ready | 183 ms | 682 ms | 923 ms |
| Unscrambling it, with the turns between | 4.4 ms | 19 ms | 30 ms |
| The longest the page waits at once while it's unscrambled | 1.2 ms | 5.3 ms | 8.8 ms |
| Making the table of pairs, once a page | 4 ms | 5 ms | 7 ms |

- **Reading:** about 2 to 3% longer, and a few ms more for the first scrambled model in a page.
  The page never waits longer than 9 ms at once, about half a frame at 60 frames a second.
- **Downloading:** 251 bytes more, gzipped (3,286,005 bytes, from 3,285,754): 0.008%.
- **Memory:** nothing more. It's unscrambled where it lies, in place.
- **Kept in the browser:** the same size.
- **Building:** about 16 ms a file.

A real phone, and Safari, will differ from Chromium slowed down on a Linux machine; the
proportions should hold.

### Other ways, measured and turned down

| Way | Downloading | Unscrambling, desktop and 6 times slower | Why not |
| --- | --- | --- | --- |
| Every byte XORed with a stream of numbers | 54% more (5.07 MB) | 3 ms, 20 ms | Nothing repeats any more, so gzip packs nothing: 1.8 MB more to download |
| Gzipped first, then XORed | No more (3.27 MB) | 33 ms, 201 ms | Unpacking it holds the page up, for up to 156 ms at once slowed 6 times: a stutter on a phone |
| Only the file's map (its JSON, 1.2 MB), and its pictures' headers | 35% more (4.43 MB) | 7 ms, 49 ms | The map is text that packs well, and doesn't once it's scrambled |
