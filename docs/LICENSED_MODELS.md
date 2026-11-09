# Licensed models

Some of the game's models aren't free to reuse: they were bought, and are in the game with the
seller's permission, or under a licence that gives it. Today they're the Dreadthorn, HuyKhoi2407's
Dreadthorn Dragon; the werewolf, Fab's Werewolf - Mythical Creature, with its five other skins; the
ants' nests' nine: the great centipede, Fab's Centipede Monster-V2; the Ant Monster, Fab's Ant
Monster V1b; the giant ant, Fab's Ant V2; the dungeon spider, Fab's Spider V3; the elite dungeon
spider, Fab's Spider V6a; the dungeon scorpion, Fab's Scorpion V5d; the giant cockroach, Medhue's
Cockroach from Fab; the dungeon wasp, Fab's Vespa Titanus Giant Wasp; the black widow, Medhue's
Black Widow from Fab; the hells' Lord of the Pit, the Infernal Demon, Lilpupinduy's Infernal
Demon RIG from Fab, with its dark look; the River of Fire's master, the greater demon, Fab's Gloomy
Demon; the hells' fiends, Fab's Monster4, with its two other skins; and, to come to the hells, its six
flayed, Fab's Monster1's six builds, and its six gorgers, Fab's Monster2's four builds; the
hells' henchmen of the Pit, Andrew Ermakov's Monster3 "Villain's Henchman" from Fab, with its three
other skins; the hells' walkers, Andrew Ermakov's Monster4 "Walking Villain" from Fab, in its five
skins; the Orc Warlord and the Orc Reaver, the caves' and the outlaws' hideouts' bosses, two
dressings of Snake|3D's modular orc from Fab; the Stone Golem of Harrowstone, a rare card's world
boss, Alexander Lenski's Armored Stone Golem - Dark Fantasy Boss from Fab, with its three other
skins (kept for something rarer); the Orc King, the orc's finest dressing, another rare card's
world boss, with his two other skins, his champions Ironjaw and Bloodtusk; the Kaiju, HuyKhoi2407's Kaiju from Fab; the cerberus, Panchenko Lyudmila's Cerberus from Fab, the Halls of Bone's master in a hell and a rare card's world boss, with its two other skins; the Demon Boss, Panchenko Lyudmila's DemonBoss from Fab, the Breach's master in a hell (red) and a rare card's world boss (blue), with its other skin, green; and the Order of the Bell, Naked Singularity Studio's Templar Army from Fab, Bellhaven's zealots in its courts and its keep, in three liveries, and its riders on barded warhorses on the roads round it; its Prior, the keep's master, Alexander Lenski's Cathedral Guardian from Fab, with its three other skins; and the horses players buy at a stable and ride, Malbers Animations' Horse Animset Pro from Fab, in five coats, with the clips a rider's played on them (all 527 of the pack's animations kept besides, in the private repository, for later) (`client/models/beasts/LICENSE.md`); and Bellhaven, DmitriyDryzhak's White Castle from Fab, a place of its own, with its stand-in seen from the world round it and a kit of its parts its keep's insides are drawn with; the human peoples' timber forts, a guard tower and a forward garrison set together from Wind Ways' medieval village pack from Fab; the humans' shops' furniture, the game's first prop kit, from Wind Ways' medieval shop pack from Fab; every people's taverns', halls', temples', smithies' and shops' furniture, lights, tableware and wall dressing from Dragon Motion's Medieval Props Kit from Fab; and the humans' town houses and shops, built of Meshsmith Foundry's half-timbered building kit from Fab (`client/models/scenery/LICENSE.md`). This page is how such
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
   it there beside the old one.
2. In this repository, the catalog entry's `path`, `hash` and `bytes` the new file's, its path in
   `.gitignore`, and its `LICENSE.md` section the new file's; `npm run models:fetch`,
   `npm run build:manifest`.
3. Once that's merged, delete the old file from the private repository, and its name from both
   `LICENSE.md`s: nothing is kept that no build of `main` draws. Its line in `.gitignore` moves to
   the superseded builds at its end, and stays: a copy of it is left behind in everyone's
   `client/`, and mustn't be committed.

Files that come out the same (a model's skins, which hold no clips) stay as they are: compare the
scrambled copy's hash with the catalog's.

## Prop kits

A bought pack's loose furniture and things (a shop's counters, cupboards and lanterns) can stand
in for the game's own wherever it suits, a piece for each kind of furnishing. The first was Wind
Ways' shop furniture, in the humans' shops. The second is Dragon Motion's Medieval Props Kit's
tavern furniture, lights and tableware, in every people's taprooms and the rooms upstairs: their
tables, benches, casks, beds, chests, counters and settles, chandeliers, wall sconces,
candlesticks and a candelabrum, mugs, plates, jugs, bottles and cups, carpets, pictures, antlers
and trophies on the walls, logs by the hearth. The third is the same pack's furniture for every
people's halls (`medieval-hall`): their adventurers' guilds, town halls, keeps' great halls,
barracks and castles' undercrofts, with a carved throne, dining tables bare and clothed, benches,
strongboxes and chests, carved cabinets under their desks and counters, chandeliers, wall torches
whose flames burn in their cages, gilt goblets, open scrolls, maps, pictures, a tapestry, shields,
a sword, antlers and a skull over the hearths, runners down a keep's carpet, barrels and casks.
The fourth is its furniture for every people's temples, smithies and shops (`medieval-town`;
the humans' shops keep Wind Ways' counters and chests): the temples' candelabra on the altar and
standing either side of the statue, candles in their dishes before the shrines, a chained book,
a chandelier for the ring of candles, runners up the aisle and high-backed settles for pews; the
smithy's block under the anvil, its coal sack, a trestle workbench and a shield on its rack; the
shops' carved cabinets under the counter, chests, wall torches, standing candelabra, lecterns,
tables, casks on their blocks and rugs. The fifth is its furniture for the humans' dungeons'
floors (`medieval-dungeon`): the outlaws' hideouts, Bellhaven's keep and the Halls of Bone, with
wall torches, barrels, tables and stools, a stolen throne for an outlaw chief, a cauldron,
firewood, a handcart, chests, buckets, baskets, a ladder leant on the rock, a settle, sacks by the
crates, standing candelabra, a kite shield and a sword on the racks, a chopping block, a hound's
cage in a kennel and shackles on the walls where the captive are kept.

- **One file, a node a piece, one atlas.** Its pieces are set a square each in a `.blend`
  (`.claude/skills/import-scene-model/scripts/kit.py ... --cells 8`), then joined, baked onto one
  atlas and cut apart again by the pipeline (`cells.bakeFirst`: utilities/blenderpipeline/README.md,
  *A kit of pieces*). Scrambled into the private repository as any licensed model; its catalog
  entry (`dungeon-prop-<kit>`, `licensed`, `tier: "demand"`) maps each piece's name to its node
  (`pieces`), and world/dungeons3d.js `DUNGEON_PROPS` has each as a prop of its own.
- **The kit's entry** in `client/js/world/propkits.js` `PROP_KITS`: whose it is, the peoples
  and the kinds of inside it's for, whether its pieces are drawn from both sides (a pack made for
  two-sided materials), and each piece's role (counter, chest, cabinet, lantern...) and the size
  it's set at.
- **The insides ask for roles** (`world/interiors3d.js`: `kitted(role)`): a piece of that role
  is set out fitted to the furnishing's squares, and the game's own furnishing there is drawn
  apart (its stand-in), put away once the kit's read. Without the licensed models, or for a
  people or kind of inside no kit's for, the game's own is all there is.
- **A dungeon's floor, by its look.** A dungeon's floor is the place `dungeon-<look>` (several
  themes share a style: a hideout's, the keep's, a hell's realm's). Most of a dungeon's furniture
  is the game's scanned models (CC0), not drawn, so a kit's piece there keeps the model it stands
  for (`instead`, `interiors3d.js` `swapped`): `dungeons3d.js` furnish draws that model in its
  place when the piece can't be read, and reads it only then, and sets what's on either on
  whichever's drawn.
- **Every people's, toned to theirs.** A kit made for every people (the tavern kit) is drawn
  towards each people's own colours (`propkits.js` `TONES`, `dungeons3d.js` furnish's `tone`):
  the humans' as the pack made it, the cat folk's sun-bleached, the orcs' charred dark, the lizard
  folk's pale as bamboo, the elves' silvered, the dark elves' violet-black.
- **Lights burn where their candles are.** A chandelier's, a sconce's or a candlestick's candles'
  tips are measured when the kit's made (kit.py `candles`) and kept with the piece (`candles`);
  the game lights a flame at each (`flamesOf`), sized and turned as the piece is, and draws its
  own candles there meanwhile, so the flames are where the candles are whether or not the kit's
  read. The chandelier's chain is cut at its hub (kit.py `trim`) and it hangs from the ceiling.
- **Read whole.** The pipeline stores a kit's points as 16-bit whole numbers (meshopt's
  quantization), its node's scale and place making them metres. Put into the points as they
  were, anything more than a metre from the file's middle wrapped round: the shop counter's top
  folded into its front, read for a while as a glass case. `dungeons3d.js` `partsOf` makes them
  plain numbers first.
- **Tests:** `test/propkits.test.js` (the catalog, the choosing, the shops and every people's
  taprooms and rooms upstairs set out, the flames where the candles are, the tones, a quantized
  piece read whole, the licensed file's nodes and its one material), and
  `test/furnishings.test.js` (only the registered kits' pieces among the licensed props).

## The house kit

The humans' houses in their towns, cities and capitals (timber, brick and cottage: the stone
ones are the game's own) are built of a bought kit of half-timbered pieces, Meshsmith Foundry's
half-timbered building kit from Fab: frames and braces, the plaster and brick between, windows,
doors, corner posts, footings, gables row on row, finials. About a quarter of those it could
build are the game's own all the same, so no street is all the kit's: none round the market,
few on the main streets, more down the lanes and out behind (`kithouse.js` `KIT_MIX`, each
house's own draw from its seed). The villages keep the game's own (but for a master's shop kept
in one: below), and something more rustic is to come for them.

- **One file, a piece to a square.** `.claude/skills/import-scene-model/scripts/housekit.py` sets
  each piece in a square of its own (3 m) keeping the pack's own pivot (a wall piece's inner face
  at its foot), splits a window's glass from its frame, and lays a plane of each of the two roof
  tiles' repeats (2 m by ten rows, baked seamless from the pack's roof pieces); the pipeline
  (`private/meshsmith-houses-2.json`) bakes the pieces onto one atlas and cuts them apart again,
  each kind (`walls`, `fills`, `glass`) a node of its square, with a lower detail packed in. Its
  catalog entry (`scenery-meshsmith-houses`) maps each piece's name to its nodes (`pieces`).
- **The rules** (`client/js/world/art/kits/kithouse.js`, pure): a house planned as ever
  (kits/house.js `planHouse`) built of the kit on its own grid (2 m modules, a 1 m one, 0.2 m
  fillers), every fit measured from the pack: storeys of 2.7 m with the beams' course in the band
  between a frame's posts and its plate, jetties, the plan's openings each in its module, the
  gables row on row along the line their rafters rise along (0.518 m over the walls' top, 1.2 m a
  metre), the roof's slopes laid with its tiles on that line (gable, hip, half-hip), the eaves'
  course, verges and soffits, a ridge cap of its tiles, and on some fronts a gable of its own
  rising through the roof.
- **Dormers and wings.** Dormers light the roof's rooms on a gabled or half-hipped roof's seen
  sides (spans of 5 m or more): each rises from its eaves' wall over a 2 m module on a knee of the
  kit's 1 m frames of a gable's lowest row (1.5 m), a window in each, under the kit's gable for a
  2 m span; its own eaves' course along its sides, its cheeks hung with the roof's tiles, its
  roof meeting the main slope in valleys. Some street houses have a wing behind: across a
  house's ridge, set in from its ends, its roof meeting the back slope in valleys; behind a
  gable-fronted house, a range a metre in either side, its roof stopped against the house's back
  gable. Where a wing meets the house, the kit's inner corner pieces (its post, beams and footing)
  every storey. Each house has a dark inside (its walls, floors and roof's underside
  facing in), as the pack's plaster is open round its windows.
- **Drawn in the game** (`client/js/world/kithouses3d.js`): each house one mesh of the kit's
  own material for its pieces and roof (red or slate tiles by a corner's `roof`), merged with its
  block or chunk as the game's own houses are (town3d.js), its plaster, glass (lit at night) and
  soffits in the game's own materials; one more draw a block, and no shadows of its own (the
  plaster, the dark inside and the soffits cast the house's). Its lower detail in the world, its
  windows only near. The humans' insides' floorboards are laid with its wood floor.
- **The shops** (`client/js/world/art/kits/kitshop.js`, pure; drawn by kithouses3d.js
  `kitShopObject`): the humans' specialists' and masters' shops, in every settlement of theirs
  (a village's master's too), are built of the kit as a house is, each in a look of its own the
  same on every lot (`SHOP_LOOKS`: walls and awning stripes no house has, fill, roof, storeys,
  jetties, timbers' figure, chimney, finial), their front laid out about the kit's door in the
  middle (`centredRun`), its leaf where the game has the shop's door (core/insides.js
  `SHOP_DOORS`); its name board on the first floor over the door and its sign on the first
  floor's front corner post. GAME.md, *The shops of the house kit*, has them in full;
  `test/kitshop.test.js` measures every fit. Each people's are their own: any other people's
  shops are their own kits' till a look of theirs is set out (`SHOP_LOOKS`) and a kit builds them
  (`SHOP_KITS`).
- **Till it's read, and without the licensed models,** the game's own houses (kits/house.js);
  those drawn then are built again once it is (`town.rebuild`, `Chunks` #rebuildWhere), and the
  shops with them (a village with a master's shop asks for the kit too). The building lab shows
  both (`&kit=0`, `&detail=near`), and every shop on lots of every size (`show=shops`).
- **Checked:** `test/kithouse.test.js` (the catalog, the runs, every piece the kit's, inside its
  lot, the slopes on the line, the dormers and wings, the game's own mixed in),
  `test/kitshop.test.js` (the shops: their looks, doors, boards, signs, awnings, goods and
  neighbours), `e2e/building-lab.spec.js` (the
  draws, both ways, the street and the shops); the fits by rays and measure in Blender while it was made (the gables, the
  dormers' and the wings' within 8.4 cm of their line, no holes in walls, inner corners, gables,
  dormers' knees and cheeks or eaves, nothing through the roof).

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
