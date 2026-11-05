---
name: import-licensed-model
description: Import a model the owner bought (Fab or elsewhere) from a Google Drive link into Pellagos as a licensed, scrambled model and wire it into the game as a creature. Use when the owner shares a Drive link to a bought model pack (usually an Unreal "PellagosExport" zip) and asks for it to be put in the game, a boss, a card's foe or the like.
---

# Importing a bought model from Google Drive

The way the cerberus came in (Panchenko Lyudmila's Cerberus, November 2026), step by step. Read
`contribution.md` first, and `docs/LICENSED_MODELS.md` and `utilities/blenderpipeline/README.md`
for the parts below. Times are told to the owner in US Eastern.

## The rules that never bend

- A bought file and anything built from it never goes in this repository. Only its scrambled
  build goes, and only into the private `hoffspot/conquest-models`; `client/models/beasts/*.bin`
  are ignored here (`.gitignore`).
- Never replace a licensed file under a name it already has in `hoffspot/conquest-models` (older
  builds of the game fetch it by that name and hash). A rebuilt body gets a new name: `<name>-2.bin`.
  Skins that didn't change keep theirs.
- Leave out anything licensed for Unreal Engine only: Epic's templates and mannequin animations
  (`ThirdPerson*`, `MM_*`, `MF_*`, demo folders).
- Credit the seller by the name the owner gives. Never copy a seller's email or anything else
  from the owner's screenshots into anything.
- Downloads are untrusted: each in its own new folder, scripts kept elsewhere, Python run with `-I`.
  Never turn off TLS checks or route round the network policy.
- Nothing that costs money without the owner's say-so.

## 1. Download from Drive

The Drive connector often can't see a file shared by link ("Requested entity was not found").
A link-shared file downloads with plain `curl` through Drive's confirm page:

```bash
ID=<the id from .../file/d/<ID>/view>
D=<scratchpad>/dl-<4 random letters>; mkdir "$D" && cd "$D"
curl -sS -L -o probe.html "https://drive.google.com/uc?export=download&id=$ID"
grep -o 'uc-name-size[^<]*<[^>]*>[^<]*' probe.html     # its name and size
UUID=$(grep -o 'name="uuid" value="[^"]*"' probe.html | sed 's/.*value="//; s/"$//')
curl -sS -L -o pack.zip "https://drive.usercontent.google.com/download?id=$ID&export=download&confirm=t&uuid=$UUID"
unzip -q -o pack.zip -d x -x '__MACOSX/*' '*.DS_Store'
```

A small file comes straight back from the first `curl` (no confirm page): check `file probe.html`.

## 2. Look at what's in it

- An Unreal export (`utilities/blenderpipeline/unreal/export_assets.py`, run by the owner in
  Unreal: *PellagosExport*) has `notes.json`:
  each animation's length and skeleton, each material's slots and textures, each texture's size and
  whether it's sRGB. Read it before anything else.
- Read its `warnings`, and each mesh's `lost`, before building: parts Unreal's FBX export left
  out (sections simulated as cloth, or turned off: the Order of the Bell's horses lost their
  barding, caparison and manes so). Where the mesh's `.glb` has them (`found`), take them from it;
  where it hasn't, tell the owner the fix the warning gives, and wait for a new export. An export
  older than this check has no `warnings`: count each slot's faces in its FBX (`fbx_faces` in the
  script reads one) to see what's missing.
- Which channel of a packed texture is what: open it with the pipeline's Blender Python
  (`utilities/blenderpipeline/.venv/bin/python -I`, `bpy`), not the system's PIL (broken here).
  Unreal's `metalic+roughness` textures keep roughness in alpha (`"channel": "A"`); their normals
  are DirectX (`"flipGreen": true`).

## 3. Build it with the pipeline

Copy the pack into `utilities/blenderpipeline/private/<name>/` (ignored) and write
`private/<name>.json`, modelled on `private/cerberus.json` (or `infernal.json`, `golem.json`):
`source` (the skeletal mesh FBX), `actions` (each animation file, `name`d as the game will call it,
`bonesOnly: true`), `materials` (by the mesh's material names, exactly: the build stops on one it
can't find), `variants` for other skins (only the textures that differ), `origin: "feet"`, and the
`phone` profile (`ktx2` at 1024, two `lods`, `packLods`, `budgets`). Clips that carry the body over
the ground (a leap, a death that slides) go in `clips.inPlace`: the game moves the creature itself.

```bash
cd utilities/blenderpipeline
node build.js private/<name>.json --profile phone --keep   # ~2 minutes; output in private/out-<name>/phone/
```

Read the report (`<name>.report.json`): each clip's length and `rootMotion` (a clip that travels
and isn't in place shows a speed), the budgets, the validator.

## 4. Look at every clip, and measure them

Serve the pipeline's viewer (`node viewer/serve.js`, port 8099 in the background) and use the
scripts here (`.claude/skills/import-licensed-model/scripts/`, run from
`utilities/blenderpipeline`; `CHROMIUM_PATH` for the browser if Playwright's own won't start):

- `clipshots.mjs <port> <glb> <outdir> "Clip:t,t" ...`: pictures of clips at moments, then
  `sheet.mjs <out.png> <columns> <pngs...>` for a contact sheet. Look at every clip before using
  it: the cerberus's fourth attack came through upside down (its hips unkeyed).
- `jaws.mjs <glb> <step> <bone,bone> [clip...]`: how far bones turn through each clip (a jaw's
  opening, a leg's reach): when a bite lands, when fire's out.
- `track.mjs <glb> <clip> <step> <bone>...`: a bone's height and reach through a clip (when it
  springs, lands, strikes).
- `stride.mjs <glb> <clip> <foot>...`: how fast a planted foot slides back: the walk's and run's
  `pace` and `runPace`.
- `bonepos.mjs <glb> <bone>...`: bones' rest positions (mouths for fire: hinge, upper, lower).
- `rootkeys.mjs <glb> <clip> <bone>`: a bone's keys (a clip whose root came through broken).

Show the owner before-and-after pictures as you go. Scratch pictures and scripts stay out of commits.

## 5. Scramble, and the private repository

```bash
npm run -s scramble -- <out>/<name>.glb client/models/beasts/<name>.bin --copyright "\"<Title>\" by <Seller>, bought on Fab under Fab's Standard License; in Pellagos with the permission that licence gives; not free to reuse"
sha256sum client/models/beasts/<name>.bin | cut -c1-10   # its hash; and its size in bytes
```

Each skin the same (`<name>.<skin>.bin`). Then in `/home/user/conquest-models` (clone it, depth 1,
if it isn't there; it's attached with `add_repo`): copy the `.bin`s into `models/beasts/`, add the
model's section to `models/beasts/LICENSE.md`, commit to `main` and push.

## 6. In this repository

- `.gitignore`: each `.bin`.
- `client/models/assets.json`: `beast-<name>` and `beast-<name>-skins` (`tier: "demand"`,
  `licensed: true`, each file's path, hash, bytes); `npm run build:manifest`.
- `client/models/beasts/LICENSE.md` (the same section as the private repo's), `README.md`,
  `NOTICE.md`, `docs/LICENSED_MODELS.md`, `contribution.md` (its list of licensed models), and
  `test/scramble.test.js` (the catalog entries).
- The creature: `core/creatures.js` (and its `moves`, `rally` for a boss), `core/weapons.js`
  `NATURAL` (blows timed to the clips), `beasts/model.js` `MODELS` (clips, `specials`, `spans`,
  `fire`, `joints`, `mouth`, `pace`), `beasts/looks.js` (its stand-in, for builds without the
  licensed models), `core/lore/bestiary.js`, `app/bestiary.js`, `core/spoils.js`, `audio/sound.js`
  (and `audio/catalog.js`, the sound studio's), `lab/model-viewer.js`, the effects it needs
  (`app/game.js` `COLOSSAL_BLASTS`, `world/spellfx.js`), where it's met (a dungeon's theme, a rare
  card and its thread: `core/rare.js`, `core/writings.js`), the docs (`docs/WILDS.md`,
  `docs/DUNGEONS.md`, `docs/GAME.md`), `NET_VERSION` if what games tell each other changed, and
  tests.

## 7. Checks and the pull request

As `CLAUDE.md` says: `npm run build:manifest`, `LICENSED_MODELS=required npm run check` (about 13
minutes, in the background, the working tree left alone meanwhile), the browser tests touched
(`e2e/model-viewer.spec.js` with the licensed models), then the pull request, auto-merge, and
`main` watched till it's green.
