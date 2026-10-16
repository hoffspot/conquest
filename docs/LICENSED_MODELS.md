# Licensed models

Some of the game's models aren't free to reuse: they were bought, and are in the game with the
seller's permission. Today that's only the Dreadthorn, HuyKhoi2407's Dreadthorn Dragon
(`client/models/beasts/LICENSE.md`). This page is how such models are kept out of anyone else's
hands, as far as a game played in a browser can, and what the owner sets up for it.

**Status: planned.** Scrambling comes first, in a pull request of its own. The owner sets up the
private repository on 17 October 2026 (*Setting it up*, below), and the models move into it after
that. Until then, the Dreadthorn's model is in this repository, as
`client/models/beasts/dreadthorn.glb`.

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

Every workflow that needs the models checks the private repository out beside this one with the
key, and puts its files in place under `client/models/` before it tests or builds:

- `ci.yml`: the jobs that read the models (the browser tests among them);
- `pages.yml`: before *Put the site together*, so the site has them;
- `mac.yml`: before the app's built, so the app has them.

Where the secret isn't given (a fork's pull request), that step is skipped, and the game draws
the stand-ins. The tests that need a licensed model can't run there, so a maintainer brings such
a pull request into a branch here first.

On someone's own copy without the models, the game draws the stand-ins, and the tests that need a
licensed model say they're left out for want of it. In CI on this repository they're never left
out: a missing model fails the run.

The catalog (`client/models/assets.json`, and the `client/js/app/assets.js` made from it) keeps
each licensed file's hash and size. So the catalog's the same with the files or without them, and
`npm run build:manifest` gives the same result for everyone.

## Setting it up (the owner, once)

About ten minutes. Nothing costs money: a private repository is free on GitHub. Do it on a
computer of your own, in a browser signed in to GitHub as hoffspot, with a terminal (on a Mac,
Applications › Utilities › Terminal).

### 1. Make the private repository

1. On github.com, the **+** at the top right, then **New repository**.
2. **Owner:** hoffspot. **Repository name:** `conquest-models`.
3. **Private.**
4. Tick **Add a README file**, so the repository has a `main` branch to start from. No
   `.gitignore`, no licence.
5. **Create repository.**

### 2. Make the key pair

In the terminal:

```sh
ssh-keygen -t ed25519 -N "" -C "conquest builds: read conquest-models" -f ~/conquest-models-key
```

That makes two files in your home folder:

- `~/conquest-models-key`, **the private half**. It's a secret: it goes only into GitHub's secret
  (step 4). Never into a chat, an issue, a commit or a pull request.
- `~/conquest-models-key.pub`, the public half. It isn't secret.

### 3. Give the public half to the private repository, read-only

1. Copy the public half. On a Mac: `pbcopy < ~/conquest-models-key.pub`. Elsewhere,
   `cat ~/conquest-models-key.pub` and copy the one line it shows, which starts `ssh-ed25519`.
2. Go to `https://github.com/hoffspot/conquest-models/settings/keys` (the repository's
   **Settings → Deploy keys**), then **Add deploy key**.
3. **Title:** `conquest builds (read only)`. **Key:** paste.
4. Leave **Allow write access** unticked.
5. **Add key.**

### 4. Give the private half to this repository, as a secret

1. Copy the private half. On a Mac: `pbcopy < ~/conquest-models-key`. Elsewhere,
   `cat ~/conquest-models-key` and copy all of it, from `-----BEGIN OPENSSH PRIVATE KEY-----` to
   `-----END OPENSSH PRIVATE KEY-----`, both lines included.
2. Go to `https://github.com/hoffspot/conquest/settings/secrets/actions` (this repository's
   **Settings → Secrets and variables → Actions**), then **New repository secret**.
3. **Name:** `MODELS_DEPLOY_KEY`. **Secret:** paste.
4. **Add secret.** GitHub won't show it again, to anyone, you included.

### 5. Delete the key files from your computer

```sh
rm ~/conquest-models-key ~/conquest-models-key.pub
```

GitHub has each half where it's needed. If a key's ever needed again, a new pair is made
(*Changing the key*, below).

### 6. Let Claude reach the private repository

Claude's sessions put the models into the private repository, so the Claude GitHub App needs it:

1. Go to `https://github.com/settings/installations`, and **Configure** beside Claude.
2. Under **Repository access**: with **All repositories**, there's nothing to do. With **Only
   select repositories**, add `conquest-models`, then **Save**.

If a session still can't reach it, reconnect GitHub at `https://claude.ai/connect-github`, or
start a new session with both repositories chosen.

### 7. Tell Claude it's done

The session then:

1. **Reads the settings back:** the repository is there and private; the deploy key is there and
   read-only; this repository has a secret named `MODELS_DEPLOY_KEY`. GitHub shows a secret's
   name, never its value. If the session isn't allowed to list the secrets, the first build that
   fetches the models shows the secret's there.
2. **Puts the licensed models in the private repository:** scrambled, each with its `LICENSE.md`.
3. **Opens the pull request that moves them out of this one.** It:
   - fetches the private repository with the key in `ci.yml`, `pages.yml` and `mac.yml`;
   - takes the Dreadthorn's model out of this repository (from then on, not from the history);
   - stamps whose each model is into the model itself;
   - adds the notice beside `LICENSE` that Apache 2.0 covers the code, not the licensed models;
   - adds `npm run models:fetch`, so anyone with access can have the models in their own copy;
   - updates `contribution.md` (the steps, and the settings table in section 6) and this page's
     status.

No CI job is added or renamed, so the ruleset's required checks don't change.

## Adding a licensed model, later

1. **Check the licence first**, before anything's bought: it has to allow use in a game in a
   browser, in any engine (not "Unreal Engine only"). And the seller has to agree to the model
   being served from the game's site, as the Dreadthorn's did. The owner decides, never a
   contributor.
2. Convert it with `utilities/blenderpipeline` (its configuration in
   `utilities/blenderpipeline/private/`, which git ignores, with the bought files).
3. Scramble it, and commit it to `hoffspot/conquest-models` with its `LICENSE.md`: who made it,
   where it was bought, the permission, and "Don't copy it out of this game or use it in anything
   else."
4. In this repository: its catalog entry in `client/models/assets.json`, with its hash and size
   and a label that names the seller and the permission; its credit in `README.md`'s *Credits and
   license*; then `npm run build:manifest`.

## Changing the key

If the private half might have got out, or someone who could see it no longer should:

1. On `hoffspot/conquest-models`: **Settings → Deploy keys**, then **Delete** the old key.
2. Make a new pair, and add it, as in steps 2 to 5. Adding a secret with the same name,
   `MODELS_DEPLOY_KEY`, replaces the old one.

Builds between the two steps can't fetch the models, so run them again afterwards.

## Scrambling

Each byte of a licensed model's file is swapped for another, through a table made from a fixed
seed (a shuffle of the 256 values a byte can have). The same byte always becomes the same byte, so
what repeats in the file still repeats, and gzip, which GitHub Pages sends every file with, packs
it as small as the model itself. The game swaps the bytes back as it reads the file, a MiB at a
time with a turn between, so nothing else waits long; two bytes at a time, through a table of
every pair, for speed.

It's not a secret, and can't be: the game has to undo it, so anyone with the game's code can. It
stops a model being saved, opened or found as one, and no more.

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
