# Characters

The character engine behind Pellagos's player (a human) and its first enemy (an orc). It covers
bodies you can reshape and reskin, equipment that goes on and off, movement that follows real
joints and real walking, and fighting: attacks with every weapon, flinches for every kind of blow,
and falling down. The game's character maker uses it ([GAME.md](GAME.md#the-screens-mainjs)), and
the **character lab** shows everything it can do:
<https://hoffspot.github.io/conquest/character-lab.html> (or `npm start` and open
<http://localhost:8080/character-lab.html>).

The lab lets you:

- **Build a body.** Pick the human, the heroine or the orc, then change gender, muscle, weight,
  height, bust (for female bodies) and heritage, plus 26 face and physique sliders (jaw, brow,
  nose, ears, shoulders, limbs...).
- **Change how they look.**
  - Skin tone, blotchiness, redness, freckles, warts, veins and war paint.
  - Eye colour and pupils.
  - Ten hairstyles, four beards, and hair and brow colour.
  - Whole texture skins: save the painted skin, paint over it, and load it back.
- **Dress and arm them.** 18 garments and 19 items go in 16 slots, with ready-made outfits
  (adventurer, knight, mage, ranger, gunner, orc raider).
- **Watch them walk and run.** Walking is made from gait-lab data, running from sprinting
  studies. You can change the speed (up to a sprint of 8.5 m/s) and the walk style, walk in a
  circle, see the joint angles through the stride, and show the skeleton.
- **Play motion capture.** Two of MakeHuman's clips, a walk and a zombie walk, and five of
  Mesh2Motion's (an idle, walk, run, sword attack and death), are retargeted to whatever body
  you've made.
- **Fight.** Arm them with any of the game's weapons, stand on guard, attack (once or over and
  over, in slow motion if you like), be hit by each kind of blow, fall and get up (Motion tab,
  Fighting), any of each weapon's five ways or any but the last, as in the game.
  `?weapon=sword&action=attack&at=1&speed=0&way=2` shows one moment of an action, frozen.
- **See it from the game's camera** ("Game view").

## How it's put together

Everything is in `client/js/characters/`. It is one body, one skeleton, and everything else fitted
to them.

| File | What it does |
|---|---|
| `scripts/build-characters.js` | Prepares MakeHuman's body (CC0) at build time into `client/characters/human.bin` (1.4 MB, gzip) and `human.json` |
| `body.js` | Loads that, and shapes the body: blends the slider shapes into the mesh and moves every joint the same way |
| `macro.js`, `details.js` | The sliders: which of MakeHuman's shapes each one blends |
| `pack.js` | The data file's compact encoding (shared by the build and the browser) |
| `rig.js` | The skeleton: 52 bones with Mixamo names, posed by anatomical joint angles within real ranges of motion, and two-bone IK |
| `character.js` | A character: the skinned meshes, its look and its equipment |
| `skin.js`, `face.js`, `noise.js` | Painting the skin and eyes; where the hairline and beard are |
| `hair.js` | Hairstyles and beards, grown as hair cards |
| `garments.js` | Clothing and armour fitted to the body |
| `items.js` | Rigid equipment: weapons, shields, helmets, packs, tusks |
| `equipment.js` | Slots, sockets and the equipment catalogue |
| `gait.js` | Walking and running data: joint angle curves, cadence and stride by speed |
| `locomotion.js` | The walker: poses the skeleton from the gait data as the character walks and runs |
| `bvh.js` | Motion capture: reading BVH files and glTF clips and retargeting them to our skeleton |
| `scripts/build-clips.js` | Takes the clips the lab tries out from Mesh2Motion's (CC0) into `client/characters/animations/mesh2motion.glb` (206 KB, 102 KB gzipped), and has the game's baked |
| `scripts/bake-clips.js`, `clip-keys.js` | Bakes the clips the game plays (Mesh2Motion's) into key poses for actions.js: `clip-keys.js` |
| `presets.js` | The human, heroine and orc |
| `peoples.js` | The other peoples' bodies, skins and parts: elves, dark elves, cat folk, lizard folk and orcs (docs/WAR.md M5) |
| `folk.js`, `soldiers.js` | Townsfolk and soldiers made up from a part, a sex, a seed and a people |
| `kit.js` | Loads everything characters share, once |

The lab itself is `client/character-lab.html`, `character-lab.css` and `client/js/lab/character-lab.js`.

### The body

The body is MakeHuman's base mesh (`hm08`), taken from its Blender add-on
[MPFB2](https://github.com/makehumancommunity/mpfb2), whose assets are CC0.
`npm run build:characters -- --mpfb2=../mpfb2` prepares it.

- **Parts.** The build keeps the body (13,380 vertices), and the eyes and eyelashes (which
  MakeHuman keeps as "helper" meshes). The lashes are see-through and two-sided, drawn both
  sides at once (`forceSinglePass`: three.js would otherwise draw a see-through two-sided
  material's back, then its front, a draw call each, and a lash is too thin for the order to
  show).
- **Bones.** It keeps the 52-bone Mixamo rig and its skin weights (the four strongest per vertex).
- **Body shape.** The build also keeps 60 shapes ("targets") behind the gender, muscle, weight,
  height and heritage sliders. They are stored as their principal components: 29 of them
  reproduce all 60 exactly.
- **Face and physique.** 84 sparse shapes sit behind the face and physique sliders, among them
  the waist, hips, buttocks and thighs (MakeHuman's measure and hip shapes).
- **Bust.** 18 more sparse shapes sit behind the bust slider: MakeHuman's cup size shapes (at
  average firmness), a small and a large cup for each muscle and weight. They blend like the
  macro shapes, times how female the body is. MakeHuman leaves out that last part, so a man
  with a larger cup would grow a bust; here the slider does nothing to a male body, and the lab
  greys it out. The middle of the slider is the body as MakeHuman makes it.
- **Joints.** In MakeHuman, each joint is the average of some vertices, so the build also stores
  how far every joint moves with every shape. The skeleton fits every body.
- **In the browser.** Shaping a body blends those shapes into new vertex positions and joint
  positions in about 4 ms. The skeleton is fitted to the joints and the skinned mesh follows.
- **Rest orientation.** Bones rest with no rotation, so their axes are the world's.

Each detail slider blends MakeHuman's own shapes. For example, "Pointed ears" is
`ears/l-ear-shape-pointed` and `ears/r-ear-shape-pointed`.

**The orc** is the same body and skeleton pushed to the limits:

- **Body:** maximum muscle and a heavy build.
- **Face:** a square head, underbite, wide jaw, heavy brow, flat wide nose, pointed ears and small eyes.
- **Skin and eyes:** green warty skin with war paint, and yellow eyes.
- **Tusks:** placed at wherever its jaw puts the lower lip.
- **Walk:** hunched and heavy.

Because it shares the skeleton, every animation, piece of equipment and hairstyle works on it too.

**The courtesans** (presets.js `FOLK`) are an hourglass: a narrow waist (the waist slider at -0.6
to -0.9), curving hips (0.15 to 0.28: much above 0.5, the hips bulge out at the sides like
saddlebags), round buttocks (0.4 to 0.55) and busts from full to fuller (0.65 to 1), on slim,
fairly toned bodies, each a different height, heritage, face and hair.

### Skin, eyes and hair

**Skin.** The skin is painted into MakeHuman's texture layout, so any image in that layout is a
skin. That covers the lab's "Load skin…" and the skins made in MakeHuman or painted by hand.

- **Texel map.** Painting starts from a map of where every texel is on the body, made once.
- **Precomputed fields.** From that map, the parts that don't change with settings are worked out
  per texel:
  - noise from 3D positions, so patterns are seamless across the UV map's seams
  - MakeHuman's masks (lips, nails, eyelids...)
  - how hollow the skin is (creases get darker)
  - regions measured from the eyes: cheeks, brows, beard line, hairline
- **Painting.** Painting a skin then only mixes colours per texel: tone, blotches, redness,
  darker creases, lighter palms, lips, nails, freckles, veins, warts, war paint, and hair painted
  on (brows, stubble, a buzz cut or the scalp under longer hair). It also makes a bump map. Each
  of those is mixed in only where its field has any (most have none over most of the skin, and
  mixing in none changes nothing), and with no arrays made for each texel: a 1024 skin takes
  about 175 ms, where it took 440, the picture byte for byte the same.
- **Fur, stripes and scales** (for cat folk and lizard folk): fur is fine streaks along the body
  with a paler belly, throat and inner arms; stripes are bands across the body and limbs, broken
  up by noise, in a darker shade; scales are Worley cells (`noise.js` `cells`), each a little
  different in shade, darker at the edges, and raised in the bump map. Their fields are made the
  first time a skin wants them (`SkinAtlas.furAndScales`), so no one else pays for them.
- **How rough it is** (`SKIN_ROUGHNESS`): painted in the picture's alpha, which skin had no use
  for, so it costs nothing to keep. Skin is a little glossy (0.56), oilier down the middle of the
  forehead and the nose (the T-zone, a field of its own), matte in its creases and where hair's
  painted on; lips are moist and nails glossy; fur is matte, and scales glossy with rough cracks
  between them. The body's material (`surfaces.js` `SkinMaterial`) reads it as its roughness.
- **In the light** (`SkinMaterial`): light reaches a little way round past where skin turns from
  the sun or a lamp, red furthest (`SKIN_WRAP`: 0.3 of the way round a quarter turn for red, 0.13
  green, 0.08 blue), as light scattered under the skin does, so a shadow's edge on a face is soft
  and warm, not a grey line; its highlights are the sharper for being wet or oily where it is. A
  handful of operations a pixel, no more memory; with three people close in the taproom, no
  difference to the time a frame takes that could be measured.

**Eyes.** Eyes are painted too (iris fibres, limbal ring, pupil or slit, sclera). They are drawn
on MakeHuman's eye helper mesh with a glossy clear coat. Each look of eye is painted once and its
picture shared by everyone with it (irises come from each people's few colours), kept a while
after the last with it has gone.

**Hair.** Hair is thousands of thin strips (hair cards) with a strand texture, grown from roots
spread over the outside of the head above the style's hairline (never inside the mouth), and
groomed so it looks kept:

1. **Direction.** Each strand leaves the scalp in the style's direction: from the crown, combed
   back, away from a parting, standing up (a crest), or to a tie or knot. Neighbouring strands turn
   the same way (a little, as a comb leaves them), rather than each its own.
2. **Lying on the head.** It's grown in fine steps (half a centimetre), so it follows the curve of
   the head. Hair is soft, so over the upper half of the head, where the scalp faces up, gravity
   presses it flat: it lies on the head in its own layer just off the scalp, sliding down its sides.
   It goes round the face, along the hairline, never down over it.
3. **Hanging.** Below the head's widest point it hangs straight down (strands grown lower on the
   head start downhill), draping over the neck, shoulders, chest and back (the skin, taken as a
   smooth surface through its points): forward over a shoulder if it grew in front of the ear,
   back if behind, never swept out sideways. Hair drawn to a tie or knot lies on the head all the way
   there, pulled taut.
4. **Cut.** A bob and long hair end at a hem (clean, a little longer behind), not at random lengths;
   other hair grows shorter low on the head (round the ears, at the nape).
5. **A parting** runs only over the top of the head, with roots all along it a hair's breadth
   either side, so it's a thin line; behind the crown the hair falls straight down.
6. **Smoothing.** Each strand is smoothed where it hangs (no kinks where it meets the body), then
   resampled to a few segments, more where it bends. Its card faces out from the scalp, or the
   body it lies on, or (hanging free) out from the neck, so it never twists edge on.
7. **A ponytail** is a round bundle from its tie: gathered there, full a third of the way down,
   tapering to its ends, clear of the back by its own thickness, strands all round it.
   **Twin tails** are two such bundles, a little slimmer and longer, from ties high on either
   side of the back of the head, the hair either side of a centre line drawn to its own tie, with
   a short fringe of bangs over the forehead.
8. **Texture and scalp.** Strands are solid from the root (a card's root edge is at the scalp) and
   fade over their last few millimetres. The scalp under hair is painted solidly in its colour, a
   shade darker, so nothing shows between the cards.

Tests check that no hair sticks out from the head, falls over the face or down the throat; that
cut hair ends at its hem, parted hair starts at its parting, the back of the head is covered as
thickly down the middle as anywhere, and a ponytail is round, not flat. Growing a character's hair
takes about a tenth of a second for the tavern's folk (at their level of detail), a quarter of a
second at the most detailed.

**In the light** (`surfaces.js` `HairMaterial`): a head of hair's highlights are bands across the
strands, not round spots. Two are lit (Kajiya and Kay's model of a strand, with the lobes shifted
along it as Scheuermann did, `HAIR_SHINE`): a narrow white one from light off the strands'
surface, and a wider one a little nearer the roots in the hair's own colour, light that's been
through a strand and back. Each strand's bands sit a little along from its neighbours', by how
light that strand is in the texture (Scheuermann's shift texture, without a texture of its own), so
they break into streaks along the strands rather than lighting a card at a time. Which way the
strands run is found where they're drawn, from how the texture runs along each card (down it, root
to tip), so nothing more is stored; about twenty operations a pixel of hair.

Hair near the head is skinned to the head; long hair hands over to the neck and upper back.
Beards grow from the jaw the same way, lying along the face. Under a helmet or hat, only hair from
below the rim is grown, so long hair hangs from under a helmet.

### The other peoples

`peoples.js` makes each people's look from a seed (`peopleLook`): the build (macro sliders' ranges
by sex), their features (detail sliders' ranges: an elf's long, swept-back ears; a lizard's snout),
their skin (tones, fur, stripes, scales), eyes (slit for cats and lizards), hair, and the parts of
their own they wear:

- **Cat's ears** (`catEars`, slot `ears`): a pointed, flattened cone either side of the top of the
  head, leaning out, pink inside.
- **Tails** (`catTail`, `lizardTail`, slot `tail`): tubes tapering along a curve from the base of
  the spine, a cat's down behind the legs and curling up, a lizard's thick and down to the ground.
  They sway as their wearer goes (`Character.settle`).

What's made of their skin (the item material named `skin`) is drawn in their own skin's colour
(`tinted` items: `Character.materials.tint`). Cat folk wear no helmet or hat over their ears (a
crown sits between them).

### Uniforms and livery

Each people's soldiers wear a uniform, and their officials a livery, in the people's own colours,
chosen to set off their skin or fur, with their emblem on surcoats, tunics, shields and cloaks
(`liveries.js` `LIVERIES`), so whose they are shows at a glance:

| People | Cloth and trim | Metal | Emblem |
| --- | --- | --- | --- |
| Humans (of every colour) | Royal blue and gold | Bright steel | A crown |
| Elves (pale) | Forest green and silver | Silvered steel | A leaf |
| Dark elves (ashen violet) | Deep violet, black and silver | Black steel | A spider |
| Cat folk (tawny, gold, grey) | Indigo and saffron | Bronze | A sun |
| Lizard folk (green) | Crimson and turquoise | Bronze | A serpent |
| Orcs (green) | Blood red and black | Blackened iron | Claws |

- **A soldier** (`soldierKit`) wears their people's helm (each people's own shape, `items.js`:
  the humans' with a nasal and a plume, the elves' with a silver leaf along the crown, the dark
  elves' crested with spikes, the cat folk's opening round their ears, the lizard folk's with a
  fan of feathers, the orcs' horned), a surcoat with the emblem over mail (the lizard folk over a
  quilted gambeson; the orcs a lacquered red breastplate with black claws, over bare arms),
  vambraces, gauntlets, a war belt, trousers under greaves, and plate boots. With a one-handed
  weapon they carry their people's shield (the humans' a kite, the dark elves' longer and
  sharper, the elves' leaf-shaped, the cat folk's a tall oval of hide, the lizard folk's and the
  orcs' round), with a bow a quiver; a captain wears their people's cloak, edged in the trim.
- **An official** (`liveryKit`) wears a tunic of livery with the emblem, smaller, and by their
  part: a chain of office in gold (a steward, reeve, councillor, envoy or ruler), trousers and a
  belt or a long robe (a woman's always a robe), a cloak (an envoy or ruler) and a crown (a ruler).
- **Made from what's there.** Most of a people's pieces (`${id}.${people}`: `mail.elf`,
  `trousers.orc`) are the garment they're made from in another colour (`base`), drawn with its
  picture, tinted; the surcoat, the livery and the orcs' breastplate are painted with the emblem.
- **Worn by players** (`core/gear.js`: a hauberk of a people's is its mail and surcoat), a
  uniform's pieces are drawn as that people's (`dress`, `lookOf`).

The uniform lab (`uniform-lab.html`: `?people=`, `show=` soldiers or officials, `facing=` front,
side or back, `drawn=` merged or apart) shows a captain, a soldier, a reeve and a ruler of each
people side by side, walking on the spot.

### Equipment

Equipment follows the systems games have shipped (see research, below): one skinned body, with
slots, sockets and hidden skin.

**Garments** (`garments.js`) are made from the body's own surface:

1. **Region.** A garment is a region of the body, written with measurements that fit any body:
   how far down the arm (0 shoulder, 0.5 elbow, 1 wrist), how far down the leg, and heights of
   the waist, hips, chest and neck. A tunic is "the torso down to 6 cm below the hips, the arms to
   the elbow". A chest wrap is a band round the torso, from three quarters of the way down from
   the chest to the waist (under the fullest bust) to just above the armpits, so it covers any
   bust.
2. **Cut.** The body's triangles are cut exactly along the region's edge, so hems are straight,
   not jagged along the mesh. The cut (which triangles, which points are one, what's beside
   what, the edge and hem, texture coordinates and skin weights) doesn't depend on the body's
   shape, only on its measures, so it's kept for everyone measured alike (`cutOf`: everyone
   drawn all at once is fitted to the same measures), compactly (typed arrays, about 70 kB a
   garment, the 40 most recently wanted): fitting a garment again takes about 7 ms, not 23.
3. **Shell.** The region is pushed out along the normals by the garment's thickness and
   looseness, and smoothed. A breastplate is smoothed more than a shirt.
   - **Toe boxes.** The body's toes are separate tubes that no smoothing can join. So footwear
     is cut just behind the ball of the foot, and a toe cap is lofted forward from the cut, ring
     by ring, to a dome over the longest toe:
     - **The cut** is put onto a smooth outline first: its convex hull, smoothed, with its points
       spread evenly. Grown out from the skin, the edge loops over itself wherever the skin
       curves in more tightly than the boot is thick, as it does between the toes.
     - **Each ring** shrink-wraps the toes at that point along the foot (their convex hull,
       smoothed), so the cap follows the toes as a whole, down to the shortest, not each toe.
       Columns are placed by how far round they are from the top, so they never cross.
     - **The join.** Each column sets off along the boot's own slope, then eases into its ring,
       so there is no crease.
     - **Texture.** Each column slides from the boot's texture at the cut to the middle of the
       toes' part of the texture, fanning in as the cap narrows.
   - **Size.** Boots come out about a centimetre bigger than the foot all round, and plate about
     two. They are skinned from the foot to the toe bone so they still bend as the heel lifts.
     Tests check the size, and that the toe caps are closed, unfolded and on their texture.
4. **Hem.** A hem folds back to the skin, so edges have visible thickness.
5. **Skinning and texture.** Every garment vertex comes from the body, so it inherits the body's
   skin weights (it bends exactly like the skin) and texture coordinates. It is painted in the
   body's texture layout (cloth, leather, quilting, mail, plate, embroidered trim), then spread a
   few texels past the edges of the layout's pieces so no seam shows as it's minified. Which
   texel is spread to from which is the same for every picture painted over the texel map, so
   the map lists it once (`spread`, three rings of texels round the pieces' edges) and each
   picture just copies along the list, rather than every texel being looked at three times for
   each: in headless Chromium, spreading the start town's garments and outfits went from 280 ms
   to 30, and putting the outfits' pictures together from about 210 to 90.
6. **Hiding.** Skin under a garment isn't drawn, and neither is a garment under another one.
   Layers go underwear, clothing, mid layer, armour, belts and straps.
7. **Drawn all at once** (`merge`: everyone but a player). A soldier in uniform wears nine or
   ten garments, each a draw call. As every garment is painted on the whole body in the body's
   texture layout, one picture can show them all (`compositeGarments`): at each texel, the
   outermost garment whose region takes it in (each texel knows which body triangle it's in and
   where, so each garment's region is worked out there exactly as its edge is cut), tinted as its
   make is, with a second picture of its heights, roughness and metalness (a bump, roughness and
   metalness map). Their meshes are then one mesh, one draw call. So that one picture fits
   everyone in the outfit, the garments are fitted as they'd fit a body of the usual shape
   (`referenceMeasures`), their hems falling in the same place on the body's surface whatever its
   build. The picture is made once per outfit (about 50 ms) and let go when no one's worn it for a
   while (the eight most recent kept); lace and drapes are drawn as before. Battle damage tells
   metal from cloth by the metalness picture.

**Built a step at a time.** Building someone takes a few hundred milliseconds on a desktop (their
skin painted, hair grown, each garment fitted, their outfit's picture painted the first time it's
worn), more on a phone: too long for one frame. So `Character.building(kit, options)` builds the
same character a step at a time (a generator: each yield a place to stop for the frame), and the
game builds everyone who comes into view that way, a few milliseconds a frame (`#dressing`): the
skin a few rows a step (`paintingSkin`), the hair a few dozen strands a step (`growingHair`), each
garment's shell and toe caps (`fittingGarment`), a garment's picture a few rows a step the first
time (`paintingGarment`) and an outfit's (`compositingGarments`), then each thing carried. With
everything once made kept, the longest step is 10 to 20 ms on a desktop, where a soldier or one of
the folk was one piece of 300 to 800 ms. `new Character(...)`, `setLook` and `setEquipment` take
every step at once, as before (the character maker, the paperdoll). Its hair is grown once: under a
helmet or hat, only what's below its rim, when it's dressed (it was grown whole first, and grown
again for anyone carrying anything). Tests build soldiers, folk and a hero both ways and check
they're the same, and each piece the same step by step as at once.

**Skins painted elsewhere.** Painting a skin is about half of building someone (a couple of hundred
milliseconds at 1024, a phone's at 512 as long). The game gives the kit a painter (`skins.js`
`Skins`, made with the kit in `app/session.js`) that paints them in a worker (`skin-worker.js`),
sent a copy of the skin atlas's fields once (and the fields for fur and scales when first wanted).
A character built a step at a time asks for its skin first (`ask`), so it's painted while the rest
of it is built, and puts it on last (`painting`): if it isn't back yet, that step yields `WAITING`
(`core/steps.js`), and whatever's taking the steps comes back to it next frame (`Steps`), or, if
it can't wait (all at once, or the game played on at once in a test), passes it `NOW`, and it's
painted here. The game's loading, which draws nothing meanwhile, takes each character's steps as
fast as they go but waits for its skin (`allWaiting`: the worker's heard from between; or, the
worker gone quiet for ten seconds, as a phone short of memory can stop one, painted here), so
those built before the game starts have theirs painted there too (1.3 s of the page's work in
headless Chromium, with the tavern's folk, who are now built once it's started: GAME.md). The picture is the same wherever it's painted. Where there are no workers (or one
fails), or for a whole skin picture loaded in the character lab, it's painted here as ever. In
headless Chromium on "high", this took a town's six guards from 10 s of frames to 4, and a
tavern's eight folk from 9 to 3, at 6 ms a frame.

**The skin atlas worked out elsewhere.** Where every texel of the body's texture is on the body
(`SkinAtlas`) takes about a second to work out at 1024 (more on a phone), and the game used to
work it out before showing the title. Now the kit (`kit.js`, `elsewhere`) sends the body's files
and masks to the skins worker, which works it out there, keeps it for painting, and sends back what
it found (`parts`); the page's own atlas is made from those, not worked out again, and the fields
aren't sent back over. The kit comes back without its atlas and `ready` resolves once it has it:
the title shows meanwhile, and making a character, playing and joining a world wait for it (by
then it's usually there). Where there are no workers (or one fails), it's worked out here, after
the title's shown. The same atlas either way (`test/character-building.test.js`). The labs work it
out here, as ever. In headless Chromium on "high", to the title: 4.8 s before (with the next
change), 2.2 now.

**Pictures kept as data.** A character's skin and height pictures, and each garment's, are kept as
the painted bytes (`DataTexture`s), not put on a canvas: no canvas's worth of memory kept beside
each, no reading a garment's picture back off its canvas to draw an outfit (`#compositing` takes
the bytes), and the heights one byte a texel (a red texture: a bump map reads its red), not grey
RGBA, a quarter of the size to keep and send to the GPU. The character lab's *Save skin* puts the
picture on a canvas when it's asked for (`skinCanvas`).

**Drapes** (`drapes.js`) are clothes that hang from the body rather than wrapping it: skirts,
gowns and aprons. A garment can't hang between the legs, so a drape is built instead, as rings of
cloth round the body:

- **Fitted, then falling.** Its top ring goes round the waist, measured round the body at that
  height in 48 directions (the furthest skin in each, smoothed); two more rings take it out over
  the hips, where the body (and the tops of the thighs) is widest. Below that, twelve rings fall
  to its hem (from the hips at 0 to the ankles at 1), rounding off from the body's shape to a
  circle and flaring out by its `flare` (a share of the hips' width), with pleats round it,
  deeper towards the hem and shaded darker in their folds.
- **An apron** only goes part of the way round (`arc`), at the front, a little out from what's
  under it.
- **Skinned** like the body: the waist to the lower back and pelvis; below the hips, more and
  more to the thighs (up to 90% at the knees), each side to its own, the front and back shared;
  below the knees, more and more to the shins. So the hem swings as the legs walk, and sitting,
  it lies over the lap and falls down the shins.

The tavern's folk wear them: wool, green and red skirts, a velvet gown, and the barkeep's apron
(the smith and apprentice a leather one, longer and stiffer; a temple's priest and acolyte an
alb's white skirt to the floor, under an alb with long sleeves and, the priest, a chasuble
bordered in gold; an adventurers' guild's receptionist its uniform, a white blouse under a navy
vest laced in gold and a navy skirt to the knee; a mage a robe to the ankles),
over a chemise (low-necked, short-sleeved) and a laced bodice (a band from under the waist to over
the bust, painted with a cord criss-crossing down the front).

**Lingerie** (`garments.js` `DESIGNS`) is modern lace with a nod to the period, worn by the
courtesans upstairs. It isn't cut by its region, which only has to take it all in (the torso from
the waist to the shoulders for a bra), but by a **design**: what fabric is at each point of the
*base* body, where garment textures are painted. So it fits every body, stretching with it (a
fuller bust stretches its cups with it), and moves with the skin in any pose.

- **Fabrics.** None (the garment is clear there), floral lace (flowers on a honeycomb, each
  turned its own way, on tulle crossed by curling stems, with scalloped edges bound by a cord),
  lined lace (opaque, the lace showing on the lining), a band (satin straps, waistbands, ribbons
  and bows), sheer stocking (darker at the heel and toe, with a seam up the back), fishnet and a
  corset's satin (boned, piped along its edges, with lace laid over it). Edges are soft over a
  texel or two, so the texture filters smoothly.
- **The designs.** A bra (triangle cups of lace round the nipples, lined in the middle, on
  satin straps and a thin band, open under the bust between the cups, with a bow between them);
  briefs (low on the hips, cut high at the sides and to a tanga behind, lined over the groin and
  between the legs, on a satin waistband with a bow); a suspender belt (a lace belt round the
  hips, satin suspenders down the front and side of each thigh to clips at the stockings' tops);
  stockings to mid-thigh with deep lace tops (sheer or fishnet); an underbust corset, laced up
  the front over the skin, edged with lace along its top; and a velvet choker edged with lace.
- **Colours.** Each design is painted once, in white, and the material's colour tints it, so
  black, crimson, emerald and ivory sets share their textures (`lingerie(name, colour)` makes a
  set's garments: `laceBraBlack`, `laceBriefsCrimson`, `suspendersEmerald`, `stockingsIvory`...,
  and `fishnets`). The texture is straight (not premultiplied) alpha, white where it's clear too,
  so the fabric's edges don't darken as it's minified.
- **What shows.** The material is see-through (blended, and discarding what's clear, so nothing
  invisible hides what's behind it), and casts no shadow. The skin under lingerie is still drawn,
  except under what's opaque: every body triangle whose corners are all lined or a band is hidden
  (`designSolid`), and so is anything worn under it there. The nipples and the groin are always
  under lining (the bra's lined cups reach at least 2 cm past where the skin's masks paint the
  nipples; the briefs' lining covers the whole groin and between the legs), and the skin there is
  never drawn, so nothing shows through in any pose or on any body. Tests check both. This is
  lingerie, not nudity: nothing explicit is shown, and none is meant to be.

The courtesans wear four sets: black lace with suspenders, sheer black stockings and a choker;
crimson under a crimson corset with fishnets; emerald with suspenders and emerald stockings; and
ivory with suspenders, ivory stockings and a choker.

**Items** (`items.js`) are rigid models on **sockets**, points on bones placed from the body's
shape:

- the palm of either hand, with the grip across it
- the outside of the left forearm, for shields
- the middle of the head, for helmets, sized to fit it
- the upper back, for packs, quivers and slung guns
- inside the lower lip, for tusks
- the outside of each hip, on the belt, for what hangs from it
- over the tips of the toes, round the back of each heel, and down the front of each shin (on
  the skin, placed from the foot's and shin's own vertices), for spiked boots' iron

**Drawn in few meshes.** An item's parts of all its materials that can be (opaque, not glowing,
not skin) are one mesh, a draw call, rather than a mesh for each material: each vertex says which
of the item's materials it's of (a byte), and one shader for every item gives it that material's
colour, metalness and roughness (`FoldedMaterial`: each item's materials its own, shared by every
item of the same ones). A two-sided part (a plume, a pennant, fletching) is folded in with its
faces doubled, each lit from its side, as a two-sided material draws it. What's left apart is a
mesh for each material: a crystal (see-through, glowing), hot iron, a ruby, and what's of the
character's own skin or fur (a cat's ears and tail, which they colour). A soldier's helm, shield,
sword and scabbard were eleven draw calls and are four; across every item's models, 119 meshes
became 48, for about 10% more vertices (the doubled faces). Their pictures are the same.

An item can bring a garment: a backpack brings its straps, spiked gauntlets their plate
gauntlets. It can hide things: a helmet hides the hair above its rim. It can also set how its arm
is carried when walking: a shield at the side, its face out (or slung on the back, below), a
staff or war hammer upright, a sword or wand lowered, a grimoire open on the palm, fists clenched,
with less arm swing and a gripping fist. An arm swinging free is held 10° further out when
something hangs at its hip (a wand in the belt) or its hand wears spiked knuckles, and 24° past a
sword's or cleaver's hilt hung forward of the hip, so it swings past them, not through them
(`Character.clearing`); an arm carrying something, 5° further out from what hangs at its hip only
(`Character.hung`).

**Fitted clear of the body.** Head-wear is fitted to the skull under it (`fitted`, from
`skullOf`: how far the head reaches behind and before its middle at each height, and how high):
its back drawn out and its crown raised as far as the skull needs, with 6 mm to spare for a
lining, so a longer or taller head never comes through a helm, a hat or a crown; a band (a crown,
the cat folk's open helm) is drawn out both ways. A shield stands off the forearm by its straps
and pad, as far as the upper arm is thick and 4.5 cm more, so the upper arm bent up behind it
clears it; the lizard folk's and the orcs' round shields are held by a grip behind the boss,
their middle over the fist, and the others strapped along the forearm. A quiver stands 8.5 cm off
the back, a little right of the middle, clear of the shoulder blades as they roll and of an
arm reaching behind. Tails are held out behind, clear of the
heels swinging up in a run.

The game's weapons are items too: a sword, a mage's staff, a crystal-tipped wand, an open
grimoire (in the left hand, the right hand free to cast), a two-handed war hammer, a longbow with
a quiver of arrows on the back, spiked knuckle plates over plate gauntlets (one for each hand),
and the orc's notched cleaver. Every character starts in the same outfit: a tunic, leather
bracers, leather pants and leather boots.

**Spiked boots** are an item in several parts (`parts`), each on its own socket: a domed iron cap
over the toes with a spike out of its front (on the toe bone, so it bends with the toes), a band
round the heel with a spur, and a curved plate down each shin with three spikes. They bring their
own dark, calf-high leather (`spikedBootLeather`), in the feet slot.

**Putting weapons away** (`SHEATHS`). Each weapon has a place on the body it's put away in:
- a socket, and where the grip goes from it;
- which ways its point and edge face;
- what it hangs in (a scabbard, always there);
- what it needs worn to hang from (a belt, or a baldric: a strap from the right shoulder across
  the chest and back to the left hip);
- how it looks put away, if that's different (the grimoire's closed book).

| Weapon | Put away |
| --- | --- |
| Sword | In a leather scabbard with brass fittings at the left hip, hung from its frog at the belt, the hilt forward of the hip and up, where the right hand crossing in front of the belly takes it, the blade down and back behind the thigh |
| Orc cleaver | At the left hip too, as a messer was worn: hung from a ring on the belt, the grip forward, the blade down and back behind the thigh, its edge forward |
| Wand | Tucked in the belt at the right hip, the tip down and a little back, clear of the thigh |
| Grimoire | Closed, hanging flat at the left hip, its spine down |
| Staff, war hammer | On the back, slung from the right shoulder: the grip up behind it by the ear, where a hand reaching up over the shoulder takes it without the elbow folding further than it can; the head (the staff's crystal) down across the back to the left hip, angled a little off the back and back from the hip, clear of the buttocks and the thigh; the war hammer's head side-on |
| Bow | On the back across the quiver, the grip up behind the left shoulder for the left hand, a little off the back so the upper arm coming down passes it (a bow looks the same either way up) |
| Spiked gauntlets | Worn: the hands just open |

`Character.sheathe(on)` moves every weapon between its hand and its place put away, and the hands'
holds with them (an empty hand swings and relaxes as it walks). Taking one into the hand, or
letting it go into its sheath (`settle`), the weapon keeps where it was in the world and settles
into its new place over a fraction of a second, the way fingers close round a grip, so the hand
needn't meet it exactly. `sheathPose(side)` says where the weapon a hand draws is put away.

**Slinging the shield** (`SLING`, an item's `sling`, `Character.sling`). With the weapons put away,
a shield that can be slung goes on the back, hung by its strap (the guige) from the right shoulder
across the chest (a baldric): its back to the upper back, the middle of its top 23 cm above the
back's socket and 6.5 cm off it (10 cm more over a quiver or a pack), leaning out 0.2 radians at
the bottom, clear of the buttocks and of the heels and arms walking and running. The left arm,
free, then swings and rests as an empty arm does. Every shield says whether it can be slung, and a
new one must say too (a test checks):

| Shield | Slung | Why |
| --- | --- | --- |
| Round shield; the orcs' and the lizard folk's round shields | Yes | Carried so on the march, by the strap |
| Kite shield; the humans' kite | Yes | The same; short enough to clear the backs of the knees |
| The elves' leaf | Yes | Light, with a strap |
| The cat folk's hide on a stick | No | Carried by its stick, with no strap to sling it by |
| The dark elves' long kite | No | Spikes round its rim would gash the arms swinging past, and it'd reach past the backs of the knees |
| A tower shield (were there one) | No | Too tall and heavy to carry on the back |

`Character.sheathe(on)` slings it with the weapons (or takes it off the back), and
`Character.slings` says whether the shield carried can be. Moving between the arm and the back,
it swings round the left side, out of the body's way: out to the left and forward of the arm, and
round from behind onto the back (`SLING.swing`: a curve through those two ways), turning only in
the middle of the move, so it never passes through the body.

**Swinging clear of the legs** (`Character.hang`, `hangs` in `SHEATHS`). A sword or cleaver hung
from the belt swings about its grip, back or forward and out from the body, as little as keeps its
blade clear of that side's thigh and shin (each a tapering capsule as thick as the leg is there,
6 cm to spare), as a leg kicks a scabbard aside; it goes at once where the leg pushes it, the
swing nearest how it hung, and falls back to hang straight again when the leg's gone by, never
into it. Its scabbard swings with it, drawn or not. Seated, the seat pushes it back to the side
of the hip and a little out and down (`seated`), clear of a forearm resting on the thigh. It's
done each frame once the legs are posed (`Actions.place`).

**Slots:** head, face, neck, under top, shirt, chest, armour, forearms, hands, waist, underwear,
legs, apron, shins, feet, back, main hand and off hand. One piece per slot.

To **add a garment**, add an entry to `GARMENTS` with its slot, layer, thickness, smoothing, look
and `inside(vertex, landmarks)` function. To **add an item**, add a model builder to `items.js`
and an entry to `ITEMS` with its slot and socket. Both show up in the lab's Gear tab.

### Movement

**Joints** (`rig.js`) are posed with anatomical angles, measured from the anatomical position:
standing, arms at the sides, palms facing the thighs.

- **Angles.** Each joint's movements are named (hip flex, abduct, rotate; knee flex; ankle flex
  and invert...), turn about named axes, and are limited to their normal range of motion.
- **Rest frames.** The body's rest pose is not the anatomical position: the arms are out at about
  50° with the elbows bent. So each bone knows the turn from its anatomical orientation to its
  rest orientation, measured from the joints.
- **Mirroring.** The right side mirrors the left.
- **Other rotations.** Rotations from anywhere else (IK, motion capture) are limited too. They are
  split into a twist about the bone and a swing of the bone. The swing is kept inside an ellipse
  made from the joint's ranges, and the twist inside its range.

**Walking** (`locomotion.js`) is made from normal-adult gait data:

- **Stride wheel.** Distance walked, not time, drives the gait phase. Cadence and stride length
  come from the walk ratio for the speed and leg length, and joint swings scale with the stride.
- **Joint angles.** The pelvis (obliquity, rotation), hips (flexion, adduction), knees, ankles,
  shoulders and elbows follow the measured curves. The trunk counter-rotates against the pelvis
  and the head stays level.
- **Height and sway.** The pelvis rises and falls in a smooth wave, twice a stride, as people's
  does: lowest just after each heel strike, highest in mid-stance, about 4 cm at a natural pace.
  How far it rises and falls, and how high it is, come from how far the legs reach through a
  stride. That is measured once for each style and body at a few stride lengths, from standing to
  a fast walk, and kept low enough that no planted foot floats. The legs bend to meet the ground
  where it's lower. It sways over the standing foot.
  - Sitting the pelvis on whichever standing foot was lowest made it drop 2 cm (9 cm for the
    orc) in a single frame at each toe-off, when the trailing toe, which had been propping it
    up, left the ground. A test checks the hips never move more than 3 mm in a 120th of a
    second.
- **Foot locking.** A planted foot stays where it landed, pivoting on its heel early in stance and
  its ball late in stance. Two-bone IK bends the leg to keep it there, the knee always bending
  forward (the thigh's anatomical forward, turned with it, is the IK's pole). A leg is never
  asked to reach more than 98.5% of its length: a planted foot that would need it slides along
  with the body instead. The swinging foot eases back (and, however long it's in the air, soon
  stops making up for how far it slid), and toes bend to stay flat as the heel lifts. The tests
  check that a planted foot moves less than a centimetre, and that, run and walked round sharp
  corners, starting and stopping, at 60 and 30 frames a second, knees never bend backwards,
  stay within 11 cm of the hip-to-ankle line sideways and never flick sideways.
  - The IK used to bend the knee towards wherever it already was. When a planted foot was held
    far from where the gait put it (running, turning, starting off), the line from the hip to
    the foot passed right by the knee, so which side the knee was on flickered: for a frame it
    swung 20 cm or more to the side, or bent backwards, bowing the leg.
- **Standing over planted feet.** Standing still, anything layered over the walk (a rest's weight
  shifted, a blow's lunge, a cast) leans the body over the feet; it doesn't step them:
  - The feet shuffle round under the body only as it turns (to face someone): towards where each
    would be under the pelvis as the walk has it (`stance`), not after the lean. They used to
    follow the pelvis wherever an action moved it, at 0.8 m/s, so every weight shift and lunge
    skated the feet.
  - The knees give: the pelvis is lowered as far as lets each planted foot stay where it is, the
    leg no straighter than the walk has it. Standing, the legs are already at 99.6% of their
    length, past the 98.5% a planted foot was let reach, so any lean at all slid the foot along
    with the body.
  - The heels rise: crouched lower than the ankle bends (its 20° of dorsiflexion), the foot turns
    up about its ball, which stays where it is, and the leg's reached again, a few times as the
    shin tips. A deep overhead blow's ankle went 17° past its range keeping the foot flat.
  - The test leans a standing body back, aside, 18 cm down and turned, and checks the feet stay
    within a centimetre, the ankle within its range and the heels up, then turns it on the spot
    and checks the feet came round under it. In the motion check, planted feet sliding fell from
    2,566 pairs (18,885 cm past the limit in all) to 470 (2,809 cm), and joints past their range
    from 977 to 596; every punch's slide, 7 to 8 cm on every body, is now under a centimetre on
    every body, and the weight shifting from foot to foot, 18.6 cm, none.
  - The knees give a millimetre more than they must: given exactly enough, rounding tipped a
    planted foot just out of reach now and then, and it let go.
- **Styles.** A walk style sets lean, crouch, arm spread, stance width, toe-out, swagger, sway,
  head carriage and finger curl. The orc's is hunched, wide and heavy.
- **Footsteps.** `onStep(foot, speed)` hears each foot land while moving (the game plays a
  footstep for the ground it lands on).

**Running** (`locomotion.js`, from `gait.js`'s sprinting curves): faster than people can walk
(the walk-to-run speed, about 2.1 m/s for a 0.9 m leg), the walk blends into a sprint over the
next 1.4 m/s, eased so it never changes gait in a jolt.

- **Joint angles.** The thigh, knee, ankle, shoulder and elbow follow key angles through a
  sprinting stride, joined by a smooth looping curve (Catmull-Rom). The foot lands under the
  knee, the leg folds under the load and pushes off behind, then the heel kicks up towards the
  buttock and the knee drives high before reaching forward to land. The arms pump against the
  legs with the elbows bent about a right angle (less, carrying something).
- **Flight.** Each foot is on the ground for a quarter of the stride, landing on its ball, so
  both feet are off the ground about half the time. The planted foot is locked as in walking.
- **Cadence and stride.** About 2.7 steps a second at a jog of 3 m/s, rising to about 4 at a
  sprint of 8 m/s, with strides of about 4 metres; both scaled by leg length.
- **Height.** The body is lowest in the middle of each foot's time on the ground and highest in
  the air, rising and falling about 6 cm. It leans 9° further forward, sways less and turns its
  pelvis further.
- The tests sprint at 8 m/s and check that the planted foot doesn't slide, the feet stay out of
  the ground, both are in the air about half the time, the steps come as often as they should
  and the hips are lowest mid-step; and that speeding up from a walk to a sprint and slowing
  back has no jolts.

### Fighting (actions.js)

Actions are layered over walking and standing: the walker sets the walk's joints, the actions
change them before the bones are posed (so IK still plants the feet under a lunge), and once the
feet are planted they reach the hands.

**Attacks** are a few key poses per weapon, timed round the blow: key time 1 is when it lands
(or the arrow or spell is let go), 2 is when the attack ends, so the same keys fit an attack of
any speed. Between keys every value follows a smooth Catmull-Rom curve, and the attack eases in
over whatever the character was doing and back out at the end. Each key says:

- **Where the hands are**: the grip, measured from the shoulder in arm lengths, in the
  character's frame (x to its left, y up, z forward, towards whoever it's fighting). The shoulder
  moves as the body twists and leans, so turning into a swing carries the arm round with it.
- **How each hand is turned.** Holding something: which way it points, and which way its edge
  faces (a blade's cutting edge, the knuckles, a book's spine). Empty: which way the palm faces
  and the fingers point. A key can also ask for the elbow to point a way (an archer's drawing
  elbow, up behind) and say how the forearm and wrist rest when nothing turns them. A key that
  leaves a hand's turn or its elbow out lets them ease back to how they'd come naturally; any
  other value a key leaves out runs on the line between the keys either side that give it.
- **Which hands it moves.** A hand is reached only from the first key that places it to the last,
  easing in and out; before and after, the arm is the walk's (or the seat's). Left out of a key in
  between, the hand keeps on its way (arms stay folded while the head nods).
- **The fingers' shape**: open, relaxed, cupped, gripping, a fist, pointing, or hooked round a
  bowstring (and beckoning, the index curled further).
- **The second hand of a two-handed weapon** grips the shaft too (the staff, the war hammer). A
  key gives it its own place, and the shaft lies along the line through both. The hand holds it
  where the item says (`haft`): a quarterstaff's hands about shoulder width apart (30 to 70 cm),
  a war hammer's rear hand at the end of the handle. It never grips past the end.
- **The spine, pelvis and hips** as joint angles, and the pelvis's offset (a lunge, a crouch into
  a hammer blow), which the legs bend to follow. The pelvis's lean (`tilt`) and roll
  (`obliquity`) are about the body's axes before it turns (`turn`): turned round, a lean back is
  forward.
- **The legs, and which foot is off the ground** (`free`: 0 to 1 for each). The walker keeps
  planted feet where they landed, bending the legs to them; a free foot is left to the leg's joint
  angles (a kick), plants afresh wherever it comes down, and the standing foot stands firm (it
  doesn't shuffle round under the body meanwhile).
- **The chest's frame** (a hand's `chest`: 0 to 1): a hand's place and turn can be given as the
  chest faces rather than the body, so fists stay up before a chest that spins round.
- **Where a weapon is put away** (a hand's `sheath`: 0 to 1): the hand goes to the grip of its
  weapon there, pointing it the way it lies. It's turned about that as strains least (the arm is
  reached once just aiming it, to see), easing from there to how the keys either side turn it.
- **Forearms and hands kept out of the torso** (`keepClear`). A hand's place is in arm lengths
  from its shoulder, so on a bulkier body than the keys were set on, a forearm can come inside
  the belly or the chest. After the arms' last reach each frame, points along each forearm and
  hand are measured against the torso's skin; one that's in is moved out by as much (up to 20 cm
  in all), and the arm reached again from how it was, up to three times. A move that wants the
  arm's joints more than 6° further past their ranges, or sinks what either hand holds further
  into the body, is halved, and after the last try taken back. A two-handed weapon's hands aren't
  moved: moving the weapon whole took the second hand off the haft and strained the arms for no
  less in the body, so its keys keep it clear.
- **A second hand on and off the weapon.** A second hand that grips the other's weapon in some
  keys and not in others (`onto`) lets go of it nearer those that don't, so it can swing free
  while a staff is whirled and take hold of it again on guard.

**Five ways of every attack.** Each weapon attacks in five ways, so no two blows in a row look
alike. The first is any of the five; after that, it's any of the other four (`variety.js`: each
character keeps track of its own last way for each attack). All of them land where the enemy
stands, in front at chest to head height, so any way can be swapped for another without the
battle knowing.

| Weapon | The first way | And four more |
| --- | --- | --- |
| Sword | A diagonal slash: up over the right shoulder, turning away; down and across through the enemy, stepping in; follows through to the left hip | a backhand slash, an overhead cut, a thrust, a rising cut |
| Staff | An overhead strike: two-handed, drawn back over the shoulder; brought down level at the enemy's chest | a sweep, a thrust, a rising strike, a spinning strike |
| Wand | A flick: tip up and back; flicked out at arm's length, pointing at the enemy | a jab, a circle, a flourish, a low sweep |
| Grimoire | A throw from the palm: the book held open in the left hand; the right hand drawn back by the shoulder, then thrown open-palmed at the enemy | an overhand hurl, a side-arm throw, a palm push, an underhand lob |
| War hammer | An overhead smash: two-handed, high over the head, arching back; brought down with the whole body, knees bending | a side swing, a diagonal chop, an upswing, a leaping slam |
| Bow | A side-on draw: turned side on, the bow at arm's length towards the target; drawn to the chin, loosed, the hand flying back past the ear | a high draw, a snap shot, a crouching shot, a canted draw |
| Spiked gauntlets | A straight punch at head height from a boxer's guard (left and right in turn, whichever way) | a hook, an uppercut, a body blow, an overhand |
| Orc cleaver | An overhead hack: raised high behind the head; hacked down | a backhand, a flat chop, a gut rip, a stab and rip |

**Spells** are cast the same way, with the free hand, key 1 being when the spell takes effect:
the left, the right keeping hold of the weapon; or, if the left holds something (a bow) and the
right's free, the right, the whole cast mirrored. A staff or war hammer is held upright out at the
right side in the one hand while the other casts, its foot clear of the legs, rather than across
the body where the turning body would swing it into them.

| Spell | The first way | And four more |
| --- | --- | --- |
| Heal (`castHeal`) | Lifted up: the hand gathers the light before the chest, head bowed; then lifts it up and open, looking up | from the heart, a circle, a rising sweep, from the earth |
| Stun (`castStun`) | A palm thrust: the hand drawn back by the left shoulder, turning away; then thrust open-palmed at the enemy, leaning in | pointed from above, a cross-body flick, a double push, a rising sweep |

The light of a spell, and the bolts and fireballs a wand or grimoire throws, have five looks
each too, chosen the same way (see [GAME.md](GAME.md), Effects).

On guard (while fighting), each weapon is held ready: the sword upright in front, the staff and
hammer across the body in both hands, the fists up, the book open.

**Swaying on guard** (`GUARD_SWAYS`). Standing on guard, a body isn't still. It sways as an
animator's fighting idle does (Mesh2Motion's, baked as loops: *Clips in the game*, below), layered
over the keyed guard. The clip's movement from its own mean is added: the pelvis and the spine's,
neck's and head's angles on top of the walk's, and each hand's place on top of the guard's. It
eases out as the walk sets off (`apply(dt, walking)`: the walker says how far into its stride it
is), and over a tenth of a second as a blow, a flinch or a fall starts, back in after (under a
kick, the pelvis rocking slid the standing foot on 150 pairs of the motion check). Each fighter starts at its own place in the loop and goes round it a little quicker or
slower (`new Actions(character, { phase })`), so a line of guards doesn't sway as one. It's kept
only as far as keeps the forearms out of the torso on every body:

| Guard | Clip | What sways |
| --- | --- | --- |
| Sword, cleaver | `Idle_Sword` | The weight shifting from foot to foot, the sword hand going with it |
| Wand; bow (the hands half as far) | `Spell_Simple_Idle` | Breathing, the chest rising, the hand moving a little |
| Grimoire | `Spell_Simple_Idle` | Breathing; the book held still (the book hand's forearm came into the belly) |
| Staff, war hammer | `Idle_Sword` | The weight shifting; both hands go with the body (the clip's moving apart brought the right forearm into the belly) |
| Fists, kicks | `Fighting Idle` | Rocking forward and back from the pelvis; the fists held as the guard has them (it keeps them a finger's breadth off the chest on the bulkier bodies: bobbing them, or leaning the spine, brought a forearm into it) |

**Arms and hands, as real ones move** (`Rig.reachArm`). The arms reach where the keys say
anatomically, whatever the body's size:

- **Every joint in its range.** The shoulder; the elbow, a hinge bending one way, up to 150°; the
  forearm turning the palm, 80° each way; and the wrist bending and tilting, never twisting. A
  hand's turn about the forearm goes to the forearm and the rest to the wrist, as far as each
  goes. A hand wanted turned further points a little otherwise rather than breaking the wrist.
- **The elbow's swivel.** An arm can reach the same place with its elbow swivelled anywhere round
  the line from the shoulder to the wrist. It takes the way that strains the joints least and
  keeps the wrist nearest straight, as people swivel the elbow rather than cock the wrist. It
  keeps the elbow down and out (or where the key asks), and moves least from the last frame.
- **Easing in and out.** Actions blend in and out joint by joint: each joint's twist and swing
  move in straight lines, so a blend between two poses in range stays in range. A plain slerp of
  the rotations swung elbows up to 34° sideways on the way. An action eases out after its last
  key (from key time 1.55 at the soonest), so a late key, like the toast's drink, is played in
  full.
- **Grips.** Each item sits in the fist as a real grip holds it. A hilt or haft lies across the
  palm from the index knuckle to the heel of the hand, so a sword's blade leans 38° from the line
  of the fingers towards the thumb, and tilting the wrist towards the little finger brings it
  nearer in line with the forearm. A staff's or hammer's haft lies nearly square across the palm,
  and a wand is pinched along the fingers. The thumb bends about its own axes (it lies turned
  from the fingers): round a grip or in a fist it closes over the curled fingers. The second
  hand on a staff or hammer closes round the shaft too. A hand holding something keeps its grip
  whatever shape a pose gives the hand.
- **Technique.** The keys follow how people really fight:
  - A sword's forehand cuts go palm up, the true edge leading, and backhands palm down. Blows land
    with the arm extended and the elbow a little bent.
  - A two-handed shaft crosses the forearms at the blow, as a bat does.
  - The bow is shot side on. The bow arm is straight, its wrist relaxed. A three-finger hook
    draws the string to an anchor at the jaw, the drawing elbow up at shoulder height behind.
  - Punches come from a guard by the chin: a straight punch turning palm down, a hook with the
    elbow level, an uppercut with the palm to the body.
  - Spells are pushed out with the palm, or lifted in a cupped hand.
- **Out of the body.** What's held stays out of the body. A staff's or hammer's butt and a bow's
  limbs pass beside the legs and hips, not through them. A tankard's rim meets the lower lip when
  drinking, rather than the tankard sitting at the chest. The two-handed keys were fitted over
  their whole motion, on the hero's build and the default one, to keep them clear while staying
  as near the original choreography as they could; the staff's blows, the war hammer's leaping
  slam, and the draws and put-aways that passed through the body, were fitted again against every
  point along what's held (not only its ends), on the builds of those who use them, within the
  joints' ranges the tests hold them to. The staff's overhead strike, sweep and spinning strike
  now end with the rear hand at the left hip, as a quarterstaff's is held, so the butt goes back
  past the hip rather than between the thighs, and the sweep is swung at the waist. A hook isn't
  carried so far across that the forearm comes down on the lead fist. The war hammer's haft ends
  26 cm below the right hand, with the rear hand at its end, as a two-handed hammer is held.
- **Kept out as it's posed.** Keys can't foresee every body, so what's held in one hand is kept
  out of the body as it's posed too, while something's being done (a blow, a cast, a draw or
  put-away, a rest). Once the arm's reached, each point of what's held (2.5 cm apart along its
  edges, looked at 8 cm of its length at a time) is set against the nearest of 700 points of the
  skin (not the hand holding it or its forearm), each placed only where it's needed: roughly by
  its heaviest bone, then exactly, once a frame. A point behind the skin nearest it, and not off
  to one side of where that skin faces, is in. The deepest one well away from the grip turns what's
  held about the grip (0.6 radians at most), one near the grip moves the hand (8 cm at most), and
  the arm's reached again from there; if a turn left it in (the wrist as far as it goes), the hand
  moves out instead. That's three times at most, less and less as the hand nears where the weapon's
  put away, so it still goes home. What's held in both hands (a staff, a war hammer) is moved out
  whole instead, never turned, the other hand following it along the haft. A shield is kept clear
  its own way (below). It's done only for characters posed at least every other frame
  (`POSING.clear`: near enough for it to show), and only as the arm's reached the last time that
  frame (the arm drawn, not the guard's under an action's), for about 0.07 ms a character a frame
  more than before, measured on desktop Node.
- **The shield** is held up before the chest, further out as the free hand would reach out, and
  swung aside to the left as the sword hand comes across the body, out of the sword arm's way. As
  it's posed, if the body (not the shield arm) has come behind its face, it's moved out along its
  face, 8 cm at most.

The tests go through every attack, cast, rest, guard, draw and put-away, holding what each is
done with, a tenth of the way at a time and at each key, and check that:

- every elbow, forearm and wrist stays in its range;
- each shoulder is in range at the key poses (within 5°), and only a little past it (under 20°),
  briefly, mid-swing;
- each hand is turned as its keys ask, straining under 35° (reaching for a weapon where it's
  put away, which then settles into the hand, the hand needn't be turned exactly, and the
  shoulder may go as far as mid-swing);
- the thumb closes over the fingers round a grip, and both fists close round a two-handed shaft;
- nothing held sinks into the body.

And (`test/clipping.test.js`) nothing worn or carried sinks more than 1.2 cm into the body (what
a sleeve or surcoat over it would hide), on every people's soldiers, the folk and the heroes:
carried standing, walking and running; a shield on guard, through every blow, cast and flinch,
and slung on the back (or carried at the side) through a sentry's rests; every weapon's blows
and casts, and running on guard with it; every draw and put-away, the shield taken off the back
and slung again with them; and the folk's and heroes' rests, each stepped a frame at a time at 30 frames a
second, as in the game. Every point along what's held is looked at (2 cm apart along its edges,
not only its corners), against the nearest of the body's vertices (not the hand holding it or
that hand's forearm), and it's in only if it's behind that skin, not off to one side of it.

**The motion check** (`client/js/characters/motioncheck.js`, `npm run check:motion`, CI's
`motion` job) goes further. It plays every motion, a frame at a time at 30 frames a second, on 30
bodies: each people's (humans, elves, dark elves, cat folk, lizard folk, orcs) at the five ends of
their builds (the thinnest, shortest and bulkiest women, the bulkiest and tallest men), each
holding and wearing what they would. That's 245 motions:

- standing, setting off, walking and running;
- each weapon's guard (still for two seconds, a sway's loop; walking; running) and its every
  blow;
- each spell's casts, and drawing and putting away each weapon;
- every flinch, every way (keyed and the clips'), slipping a blow each way (aside to the left
  and right, and back), falling dead and knocked down;
- the folk's acts (toasting, serving, pouring, forging, blessing, stamping, reading and the rest)
  and every rest of every role.

On each it measures, keeping the worst moment and where it was:

| Measure | Too much | How |
| --- | --- | --- |
| A joint past its range | 3° | `rig.js`'s ranges, every frame, every joint but the fingers' and thumbs' (closing round a grip turns them a little about themselves, which their ranges, having no twist, would take off) |
| Something held or worn in the body | 1.2 cm | As the clipping test, every 0.1 s (0.3 s in falls, acts and rests) |
| A forearm or hand in the torso | 3 cm | Points along each forearm's and hand's line, how far under the torso's skin, less how far the limb's own skin is from its line (its median: a forearm resting flat against the body comes out at up to about 2.5 cm) |
| A planted foot sliding | 1 cm | How far its heel or ball moves along the ground while it's planted on it, every frame |
| A foot in the ground | 0.5 cm | Its lowest point (heel, ball or toe tip) below the ground, every frame |
| A second hand off its haft | 3.5 cm | Where a two-handed weapon's second hand holds it against where it's meant to, every frame |

The limits were set by looking at the failures (the contact sheet, below): under them, what's
measured doesn't show (a knee 2° past its range, a forearm resting on the chest); over them, it
does.

What's wrong already is kept in `test/motion-baseline.json`. The check fails only on a pair that
is worse than that by more than a little (1° or 3 mm), or new and past its limit by as much. So CI
catches any change that makes any motion worse on any body, while the work of making them better
goes on (the plan's M8). When the baseline was kept (2026-10-04), 4,782 of the 7,242 motions on
bodies had something past a limit:

| Measure | Failing | Mostly |
| --- | --- | --- |
| Limb in the torso | 2,682 | Forearms through bulky bellies and hips (a hammer's two-handed grip; the thumb in the belt while shifting the weight); hands sunk into the back of the neck or the buttocks on the biggest bodies |
| Foot sliding | 2,440 | Rests that shift the weight (a planted heel sliding 18 cm side to side as the hips move 4 cm); attacks' steps |
| Joint | 1,101 | Shoulders turned far past their ranges reaching for a weapon on the back (up to 86°); ankles at the heel strike on short bodies (14°) |
| Foot in the ground | 559 | Seated folk on the tallest bodies (the seat's the same height for everyone: feet 11 cm into the floor); falls (the feet swung 30 cm into the ground as the body goes down) |
| Something in the body | 325 | A warhammer's head through the thigh as it's drawn or put away; a cleaver's blade through the back of the head |
| Hand off the haft | 262 | The staff's and hammer's second hand beside the haft, not on it, in some blows and flinches |

M8b (2026-10-04) kept the forearms and hands out of the torso, swung hung blades clear of the
legs, and moved the draws and the places weapons are put away (above). The baseline was kept
again:

| Measure | Failing | Past their limits, in all |
| --- | --- | --- |
| Limb in the torso | 2,682 → 745 | 9,050 → 2,018 cm |
| Joint | 1,101 → 964 | 9,966° → 5,178° |
| Something in the body | 325 → 247 | 651 → 526 cm |
| Hand off the haft | 262 | 1,274 cm (as it was) |
| Foot sliding, in the ground | 2,440, 559 | (as they were) |

Thirty pairs came out a little worse. Most are the war hammer going onto the back (its head up to
2.7 cm further into the back as it's hoisted there, and 4.5 cm into the hips on two bodies as it's
drawn), which is to be carried head-up on the shoulder instead; the rest are worse by about a
centimetre or two degrees.

The check writes a report (`test-results/motion/report.json`, kept with each CI run as
`motion-report`). **The contact sheet** (`/motion-sheet.html`, served by `npm start`) draws its
failures from it, worst first: each motion played on its body to its worst moment, the spot
ringed in red, what's worse than the baseline outlined in amber. It can show one measure, group of
motions or people at a time, or only what's new; *Close up* looks at the spot from a metre away.
It draws filmstrips too: `?film=<motion id>,<motion id>&body=<body id>&frames=8` plays each motion
on that body as a row of frames from its start to its end, seen from in front and to its right,
following the pelvis (`attack/gauntlets/5` is the punch's sixth way on a soldier with gauntlets;
the bodies' ids are as the report has them, `human-tallest-m`).

**Reactions** to being hit are functions of time and of where the blow came from (which side,
front or back), added to whatever pose the character is in, so a flinch during an attack still
shows the attack. Each kind of blow (weapons.js: an attack's `reaction`) has its own, and its own
effect where it lands, so how a character reacts depends on what hit it:

| Blow | Reaction | And as the animators' (`clips`) | Effect |
| --- | --- | --- | --- |
| slash (sword) | twists away from the blade, head snapping away | | sparks |
| strike (staff) | rocks back, head thrown back | `Hit_Chest`: doubling over it | dust |
| arcane (wand) | a shudder through the whole body | | violet light |
| fire (grimoire) | flinches back, arms up to shield the face | | fire |
| crush (war hammer) | doubled over, knees buckling, knocked back | | a flash and dust |
| pierce (bow) | a sharp jolt at the chest (and the arrow sticks) | `Hit_Chest` | sparks |
| punch (gauntlets) | the head snaps round | `Hit_Head`: the head jolted, the body knocked back a little | a flash and dust |
| hack (orc cleaver) | a heavy cut that twists and staggers | | sparks |
| kick (spiked boots) | winded: doubles over, driven back a step, the arms drawn in | `Hit_Chest` | a flash and dust |

Where a reaction has the animators' hits too (Mesh2Motion's, baked: *Clips in the game*, below),
they're done in turn with the keyed one, never the same way twice running (`react(name, { way })`
picks one). A clip's hit is added from its own first pose, played through in the reaction's time
and eased out over its last third: its spine's, neck's, head's and collarbones' angles and its
pelvis, mirrored when the blow comes from the right and leaning the other way from behind. The
hands stay where they were.

**Slipping a blow** (`dodge({ from })`, `DODGES`): when a blow is slipped (the battle's `dodged`:
by the player's own knack for it, Evasion, or the Dodge spell), the body ducks under it as Mesh2Motion's `Dodge_left` does: forward and down
by up to 28 cm at the head, leaning aside, away from a blow from the side (mirrored for one from
the left). Or it sways back and round as `Dodge_back` does. From one ahead it goes either way or
back, never the same twice running. It's added from the clip's first pose like a clip's hit, eased
out over its last quarter, with the feet planted where they stand. Its lean is taken at 65%:
all of it, over a guard's, took the spine 8° and the neck 13° past their ranges. The hands on guard
stay before the face as the head ducks, going forward and aside with it as a boxer's do (the
cat folk's gauntlets were in the head), unless both are on a haft. And they turn with the chest as
it goes round: the backward dodge's 37° turn had the lizard folk's forearm 11 cm into the belly.

To give a new attack its own reaction, add an entry to `REACTIONS` and name it in the attack.
A new attack needs at least five ways (`ATTACKS[name].variants`: a name and key poses each, or an
animator's clip baked into them: *Clips in the game*, below); the tests check each lands in front
at a fighting height.

**Kicks** (spiked boots): five ways, with the right leg and then the left (`alternate`, every
other one mirrored), each landing its blow at the enemy:
- a front kick, snapped out to the belly;
- a roundhouse, the hips turning over and leaning back, the shin whipped into the ribs;
- a side kick, the heel driven out, the body leaning right away;
- a stamp down through the knee;
- a spinning back kick, turned round on the standing foot, the heel driven straight back.

The fists stay up before the turning chest, the swinging arm flung back in the roundhouse. Kicking
with a weapon in hand (`startAttack(..., { arms: false })`), the hands stay on the weapon's guard.

**Drawing weapons and putting them away** (`DRAWS`, `draw(guard, on)`). Each weapon has a draw,
ending on its guard, and a put-away, ending with the hands free. Key time 1 is when the hand
takes hold of it where it's put away, or lets go of it there, and the weapon moves then
(`Character.sheathe`, settling). An action started meanwhile finishes the move at once. Each has
a flourish:

| Weapon | Drawn | Put away |
| --- | --- | --- |
| Sword | Across in front of the belly to the hilt at the left hip, the elbow forward and out, the body turned into it and the other hand at the scabbard's throat; swept up and out across the body, raised in a salute before the face, twirled round at the wrist, on guard | A salute, a twirl forward, the point round to the scabbard's mouth (the other hand at its throat, the body turning into it) and slid home |
| Wand | Snatched from the belt, flicked up, its tip twirled round in a circle and held up a moment | A last twirl, tucked back in the belt |
| Grimoire | Unhooked from the hip, opened before the chest, the other hand passed over its pages | Closed with the other hand and hung back at the hip |
| Staff | Up over the right shoulder, the elbow leading up and forward, to the staff by the ear (the other hand pushing its lower end up from behind the hip), pulled up overhead, its crystal swinging up from behind, over and forward, raised high, then taken on guard in both hands | Raised in one hand, swung up and back over the shoulder, the elbow forward as the hand comes away |
| War hammer | Reached for as the staff is, heaved up overhead from the back, swung over and down, its head slapped into the open left palm | Hoisted overhead and put over the right shoulder, the elbow forward as the hand comes away |
| Orc cleaver | Across in front of the belly to the grip at the left hip, the other hand on the belt beside it, ripped up and out across the body, wheeled round over the head, and brandished with a snarl | Brought down across the body, the point down to the ring at the left hip, the body turning into it, and dropped through |
| Bow | Up over the left shoulder, the elbow leading up and forward, pulled over and swung down in front, spinning, held upright and its string plucked | Raised, turned over at the left side, out from the head, and slung back over the left shoulder |
| Spiked gauntlets | The fists up, and a burst of shadow boxing: a jab, a cross, a hook and an uppercut | The fists lowered and opened, the hands shaken out |
| Spiked boots | Up on guard, and shadow kicks: a snap kick high in the air, the knee driven up | Standing down: the fists dropped, the shoulders and neck rolled loose |

**A slung shield** (`DRAWS.sling`) is taken off the back before the weapon's drawn, and slung there
after it's put away, each in turn (`draw` returns how long it all takes). Taking it off: the left
hand reaches back over the left shoulder for its rim, and brings it round the left side, out and
forward, onto the arm as it comes up on guard. Slinging it: from the guard out to the left and
forward, then back over the left shoulder, let go there and the hand let fall. Something done
meanwhile puts it where it was going at once, as with a weapon.

With the left arm free, a sentry's rests bring the hand round a sword's or cleaver's hilt at the
left hip, not through it: folding the arms, the hand comes up in front of the hilt first, and goes
down the same way (`ARMED_FOLDED`); shifting the weight, the thumb is brought to the belt from in
front and above the hilt, and hooked in it a little further forward, the upper arm off the shield
on the back (`ARMED_SHIFTING`).

**Falling.** The knees and back give way, then the whole body topples (backwards, or forwards
when hit from behind), falling faster and faster about the pelvis, lands with a little bounce,
arms flung out, and lies flat. The feet aren't kept planted while falling.

**The tavern's folk** have a few more:

- **Sitting** (`setSeated`): the thighs level (hips flexed 88°), the knees bent square, the feet
  flat, leaning a little over the table, the free arm resting on it; the pelvis lowered onto a
  45 cm bench (the hip joints 10 cm above it) and back from the middle of the square, so the
  knees go under the table. The feet aren't kept planted, but the hands still reach.
- **A toast**: a tankard (held upright by its handle, the forearm level) raised high in front,
  shaken, then brought to the mouth and tipped, the head back, and down again.
- **Serving**: leaning over a table to set a tankard down on it.
- **Pouring**: both hands to a barrel's tap in front, the left holding the tankard under it.
- **The smithy's work** (the smith holds a smith's hammer in the right hand and tongs in the left,
  their reins across the palm so the jaws point along the forearm, `turn`; a bar of glowing
  iron in their jaws):
  - **forge**: three blows on the work on the anvil, the hammer raised by the shoulder (its head
    back, its face up) and brought down flat on it, the tongs holding the work, bending into each;
  - **heat**: the work thrust into the forge's coals with the tongs, and turned there;
  - **quench**: the work plunged into the trough, and held there;
  - **pump** (the apprentice): both hands on the bellows' lever, pushing it down and letting it
    up, three times;
  - **crank**: turning the grindstone's crank round and round, the other hand on its frame.
- **A temple's**: **bless**, the right hand raised palm out and drawn down and across in the sign
  of the Hearth, the other on the chest; **light**, reaching forward to a candle's wick, bowing a
  little.
- **A guild's**: **stamp** (the receptionist), leaning over the counter, a hand holding the
  notice flat and the other bringing the stamp down on it, twice; **file**, reaching up to the
  shelves behind her; **read** (an adventurer at the quest board), a finger run down a notice,
  the other hand on the hip, the head following it.
- **Beckoning** (a courtesan, when the player comes into her sight): the hip cocked, a hand on
  it, the other held out palm up, its index finger curling "come here" three times (the
  `beckon` finger shape: the index straight, the others loosely curled; a key's `index` curls it).

### Resting

How each class of character passes the time (`RESTS`, by class: the game's roles, core/roles.js,
which name and time them): five ways each, and for many some of an animator's clips' ways after
them (below), key poses timed like an attack's (key 1 at the moment that matters: the top of a
toast, a slap on the table), played every several seconds while the player can see them, and by
the player after standing still a while. `rest(role)` plays one of
a class's rests, any at first and then any but the last; `stopResting()` eases out of it (in
0.35 s). A patron rests sitting down. An innkeeper (keeping the rooms upstairs at an inn) rests
as the barkeep does, at the counter.

| Class | Rest | The pose |
| --- | --- | --- |
| Barkeep | wiping the bar | the right hand going round and round on the bar, leaning on the left |
| | stroking his beard | the hand to the chin, stroking down twice, thinking |
| | leaning on the bar | both hands on the bar, leaning on them, looking out over the room |
| | arms folded | each hand tucked under the other arm, nodding |
| | rubbing his neck | a hand behind the neck, the head bowed and rolled one way, then the other |
| Serving wench | wiping her brow | the back of the wrist across the forehead, then a sigh |
| | hand on her hip | the hip cocked, the head tilted |
| | tucking back her hair | a hand up to the side of the head, behind the ear |
| | a curtsy | a little bob, the head bowed, the skirt held out |
| | stretching her back | a hand to the small of the back, arching |
| Patron | a toast | the toast, sitting |
| | a long drink | the tankard tipped right back, then the mouth wiped on a sleeve |
| | a belly laugh | thrown back laughing, slapping the table twice |
| | thumping the table | the tankard banged down twice, cheering |
| | looking about | over one shoulder, then the other |
| Madam | fanning herself | a hand fanning the face, quickly |
| | hands on her hips | looking over her house one way and the other |
| | touching her necklace | fingers at the throat, looking down |
| | drumming her fingers | a hand on the counter, drumming it |
| | smoothing her gown | both hands down the front of her gown |
| Courtesan | twirling her hair | a lock wound round a finger by the neck, the head tilted to it |
| | a slow stretch | both hands behind the head, elbows out, arching the back and swaying the hips |
| | a hand on her hip | the hip cocked, the other hand trailing slowly down the thigh |
| | blowing a kiss | fingertips to the lips, then the hand swept out, opening, palm up |
| | smoothing down her sides | both hands from the ribs in to the waist and out over the hips |
| Smith | wiping the brow | the back of the wrist across the forehead (the serving wench's) |
| | looking over the work | the tongs held up before the face, the work turned this way and that |
| | rolling the shoulders | (the adventurer's) |
| | stretching the back | the back arched, the shoulders drawn back, the head back, the tools kept at the sides (a hand to the small of the back would press them into it) |
| | shifting the weight | (the adventurer's) |
| Apprentice | wiping the brow | (the serving wench's) |
| | looking about, rolling the shoulders, a yawn, stretching | (the adventurer's) |
| Priest | hands folded in prayer | the hands together before the chest, fingers up, the head bowed |
| | arms raised in praise | both arms up high and wide, palms up, the face lifted |
| | a bow of the head | hands folded at the waist, a slow bow |
| | the sign of the Hearth | fingertips to the brow, then the heart, then out palm up |
| | hands clasped behind | at the small of the back (held there throughout), looking over the pews one way and the other |
| Acolyte | (the priest's prayer, bow and sign; the adventurer's looking about and yawn) | |
| Worshipper (seated) | praying | hands together, the head bowed over them |
| | head bowed | bowed low, the hands folded in the lap |
| | looking up | hands together, looking up to the altar's god |
| | the sign of the Hearth | as the priest's |
| | hands in the lap | palms up, eyes closed |
| Guild receptionist | a cheerful wave | a hand up by the face, waved side to side, the other on her hip, the head tilted |
| | chin in her hands | leaning on the counter, both hands under the chin |
| | a little bow | hands together at the waist, a quick bow |
| | tidying the papers | (the barkeep's wiping the bar) |
| | tucking back her hair | (the serving wench's) |
| Adventurer | stretching | both arms up high and apart, clear of a hat's brim, the back arched |
| | looking about | a hand shading the eyes, one way then the other |
| | rolling the shoulders | the shoulders rolled up and back, the neck stretched each way |
| | a yawn | a hand to the mouth, the head back, the shoulders up |
| | shifting the weight | from one foot to the other, a thumb in the belt (the hand brought to it from the front, over a sword's hilt) |

And from the animators' clips (`CLIP_RESTS`; *Clips in the game*, below), after each class's own
(which rest the rules pick changed with them: `NET_VERSION` 41):

| Rest | The pose | Whose |
| --- | --- | --- |
| talking | both hands going before the chest as the words come (`Idle_Talking`) | barkeep, innkeeper, madam, apprentice, receptionist, reeve, clerk, steward, quartermaster, arcanist, herbalist |
| talking (seated) | as at a table, leaning in, both hands going (`Sitting_Talking`); a patron's tankard held up before the chest, a ruler's sword hand left as it is | councillors, petitioners, patrons, rulers |
| scratching the head | a hand up to the top of the head, puzzled (`Confused`), the other arm left hanging | apprentice, clerk (not those who wear a wizard's hat) |
| listening, a hand on the hip | the elbow back, the weight on one leg (`Idle Listening`) | reeve, steward |
| a cheer | a fist raised high (motion capture, `Cheer_One_arm`, mirrored: the left, clear of a blade at the left hip), the other arm left hanging | adventurer |
| waving someone over | an arm up high, waving (motion capture, `Help_One_Arm`), the other arm left hanging | adventurer |

The lab's Motion tab has them (Resting: a class, the way from Fighting's Way, Rest), and
`?action=rest&rest=barkeep&way=2&at=1` shows one frozen.

**Motion capture** (`bvh.js`) is retargeted bone by bone in the world:

1. Pose the clip's skeleton and take each joint's turn from its rest pose in the world, in our
   axes.
2. Line our bone up with the clip's at rest, then apply that turn.
3. Turn each bone's rotation relative to its parent into an anatomical joint rotation, within its
   range.

Lining up (step 2) only turns the bones whose rest poses really differ. Mesh2Motion's skeleton
rests in a T-pose and ours with the arms down, so the upper arms and forearms are turned to point
where its do (the upper arm also turned about itself so both elbows bend about the same axis:
each skeleton's rest pose bends them a little, which shows it). Every other bone turns with its
parent, keeping our rest shape: the skeletons are just built differently there (Mesh2Motion's
collarbones point back from the breastbone, its feet are pitched down at rest, its fingers
straight), and lining those up too would pose those differences (shoulders shrugged back and
held there by their limits). MakeHuman's own clips line up every bone, as their skeleton is ours.

The clip's hip height is scaled by leg length. A clip that moves the character along (a walk or a
run) moves it at the speed the clip's feet push back; one that doesn't (standing, attacking,
dying) keeps it where it is, the pelvis going where the clip's goes. A clip played once (an
attack, a death) keeps its first frame's feet on the ground, so it can leave it (falling to the
knees), and starts again a second after it ends. Other clips need a bone name map like
`MAKEHUMAN_NAMES` or `MESH2MOTION_NAMES`, for example for CMU's.

**Mesh2Motion's clips** (`npm run build:clips -- --from=<mesh2motion-app/static/animations>`):
Mesh2Motion (<https://github.com/Mesh2Motion/mesh2motion-app>) packs Quaternius's Universal
Animation Library as three glTF files on one 66-joint skeleton (the Unreal mannequin's names,
with fingers): 178 clips, CC0. The build takes five into one file, the skeleton without the
mannequin's mesh, keeping only what moves (rotations, and where the pelvis is):

| In the lab | Mesh2Motion's | Length | Plays |
|---|---|---|---|
| Idle | `Idle_A` | 3.1 s | Loops, standing (a ready stance, feet apart) |
| Walk | `Walk` | 1.7 s | Loops, moving along |
| Run | `Jog` | 1.2 s | Loops, moving along |
| Sword attack | `Sword_Attack` | 1.9 s | Once (a turning slash with a lunge) |
| Death | `Death_A` (add-on file) | 4.5 s | Once (staggers, falls to the knees, then on its face) |

The lab plays these whole, as the clip has them.

**Clips in the game** (`scripts/bake-clips.js`, run by `npm run build:clips` too): a clip that's
to be one of the game's ways of doing something is baked into key poses, the same keys every
other action is made of (`client/js/characters/clip-keys.js`: 17 clips, 250 keys, 82 KB), so its
arms are reached within their ranges, what's held is kept out of the body, and the motion check
measures it as it does any other:

1. Retarget it (above) onto the average body, in Node: the arms as the clip has them (not held to
   their ranges: they're reached again within them), every other joint within its range; the
   lower foot on the ground.
2. At every frame, take the spine's, neck's, head's and collarbones' joint angles (`rig.js`
   `jointAngles`: `jointRotation` backwards), and each hand's place (arm lengths from its
   shoulder, as `at`), how what it holds points (`point`, `edge`) or its palm faces (`palm`,
   `towards`, and the nearest `shape` to its fingers' curl), and which way its elbow points.
3. Keep the body over the walker's feet, not the clip's: the clips stand in stances of their own
   (a boxer's left foot forward, a pelvis tipped back), and ours stand where the walker plants
   them. So the pelvis turns at most 12° and stays level, the rest of its turn, tilt and lean
   taken up the spine (the chest faces as the clip's does), and moves only a few centimetres:
   as far from the clip's feet as from where ours stand under it (an animator's figure stands
   anywhere: the motion capture's 5 to 10 cm off its origin), following only the feet on the
   ground (a heel lifting doesn't jolt it). Seated (`seated`), only as it moves from where the
   clip sits at its start; on a bench, never lower.
   The clips' legs are left out (they sank the feet into the ground and slid them up to 1.9 m),
   but a kicking leg's: that's let go of the ground (`free`) while the clip's foot is off it or
   moving, found on the clip's own legs.
4. Time it as actions are: key 1 when the blow lands (given, or when whatever's fastest, a hand,
   a held thing's tip or a foot, goes fastest), 2 at its end; and keep only the keys the curve
   through them needs to come within 3°, 2.5 cm (as arm lengths) or a little of every value. A
   loop (`loop`: a guard's sway) is timed evenly, key 1 halfway, and kept four times closer to
   the clip, its movements being small.

`clipped(name, clip)` in actions.js makes a way from one: easing out from key 1.6, its pelvis's
offset scaled to the body's height, and a hand kept as the research has it (`hands`) where the
clip's is wrong, or left as it is (null: holding a tankard or a sword, or hanging clear of a blade
at the hip). What was tried, on all 30 of the motion check's bodies:

| Mesh2Motion's | For | | Why |
|---|---|---|---|
| `Punch_Jab` (mirrored: the right hand's, as every punch's is before every other is mirrored) | Punch: *jab* | Kept | The rear fist kept at the chin (the clip flings it out beside the head) |
| `Punch_Cross` | Punch: *cross* | Kept | |
| `Kick_Breach` (motion capture) | Kick: *push kick* | Kept | The kicking leg the clip's, the standing foot planted; the fists kept up before the chest (the clip drops them) |
| `Spell_Simple_Enter`, `_Shoot`, `_Exit` (mirrored, to the wand's hand) | Wand: *thrust out* | Kept | |
| `Bow Pull Back`, `Bow Pull Hold`, `Bow Release` | Bow | Left out | Clean on every body, but drawn only to the shoulder, 40 cm from the face, not to an anchor under the jaw |
| `Sword_Regular_A`, `_B`, `_C` with their recoveries | Sword, cleaver | Left out | Lunges of up to 0.8 m; the sword arm taken up to 111° behind the body, 49 to 68° past any shoulder's range on every body |
| `Sword_Attack` | Sword | Left out | 9° past its range, but the sword arm swung straight out to the side before the cut: a flourish, not a swordsman's cut |
| `Chop_Tree` | Cleaver | Left out | The arm 27° past its range raising the axe |
| `Golf_Drive` | Staff, war hammer | Left out | The arms 73 to 78° past their range, the hammer into the forearm (the only clip with both hands on a haft) |
| `Fighting Left Jab` | Punch | Left out | The shoulder 59° past its range |
| `Fighting Right Jab` | Punch | Left out | Clean, but from the clip's idle, the fists down at the belly before it punches |
| `Idle_Talking`, `Sitting_Talking` | Rest: *talking* | Kept | |
| `Confused` | Rest: *scratching the head* | Kept | Not for those who may wear a wizard's hat (the hand through it); the other arm left hanging (the clip's into a sword's hilt at the hip) |
| `Idle Listening` | Rest: *listening, a hand on the hip* | Kept | |
| `Cheer_One_arm` (motion capture, mirrored) | Rest: *a cheer* | Kept | Mirrored: the clip's right arm, hanging, went into a sword's hilt at the hip as the body leaned |
| `Help_One_Arm` (motion capture) | Rest: *waving someone over* | Kept | |
| `Idle_Sword` (a loop) | Guard: the sword's, cleaver's, staff's and hammer's sway | Kept | Two hands on a haft go with the body only |
| `Spell_Simple_Idle` (a loop) | Guard: the wand's, bow's and grimoire's sway | Kept | The bow's hands half as far, the grimoire's held still |
| `Fighting Idle` (a loop) | Guard: the fists' and kicks' sway | Kept | The pelvis only: the fists' bob (even at 40%) brought a forearm into the chest on 5 to 8 bodies, the spine's lean on 3 |
| `Idle_Shield`, `Golf_idle`, `Pistol_Idle` | Guard | Left out | Hardly moves; a golfer's waggle; a pistol held out |
| `Hit_Chest` | Flinch: the staff's, bow's and kick's other way | Kept | Added from its first pose, the hands left as they were |
| `Hit_Head` | Flinch: the punch's other way | Kept | Likewise |
| `Dodge_left` (mirrored for the right), `Dodge_back` | Slipping a blow (Evasion, the Dodge spell) | Kept | Its lean at 65%; the feet planted (the clips step out of the way) |
| `Hit_Knockback`, `Defend`, `Sword_Block` | Flinch, a parry | Left out | Their legs are the motion: a fall, a crouch and a step (for the deaths and falls with their legs, to come) |
| `Idle_FoldArms` | Rest: arms folded | Left out | A shoulder past its range on 27 bodies; the keyed folded arms are clean |
| `Idle_Rail` | Rest: leaning on the bar | Left out | Hunched over nothing, forearms on a rail higher than the bar |
| `Greeting`, `Cheering_Two_Hands`, `Victory Fist Pump` | Rest | Left out | Clean; the keyed wave and the adventurer's two clip rests cover them |
| `Idle_ShakeOff`, `Sitting_Idle`, `Yes`, `Salute`, `Consume Item` | Rest | Left out | Hardly moves; reads as pointing; not with a sword in the hand (the sentries'); drinking from nothing |
| dances, `Tired Hunched`, `Meditate`, `Power Up`, `Shivering` | Rest | Left out | Their legs are the motion (deep crouches, steps), and ours stand where they are |

Quaternius's clips are made for games: big lunges, wide stances and flourishes. Fists, a kick, a
spell and the town's idles came over well; blades and two-handed weapons didn't, so their keyed
ways (from the research) stay. The kept ones against the keyed ways beside them (the motion
check, all 30 bodies: how many past the limit, and the worst; the feet as they stand now, kept
where they're planted, *Movement*):

| | Joint past its range | Forearm in the torso | Planted foot sliding |
| --- | --- | --- | --- |
| Punch: *jab* (clip) | none | 9, 7.5 cm | none |
| Punch: *cross* (clip) | none | 11, 6.1 cm | none |
| Punch: the five keyed ways | none | 19 to 21, up to 7.7 cm | none |
| Kick: *push kick* (clip) | none | 14, 5.5 cm | 30, 15.5 cm |
| Kick: the five keyed ways | 0 to 30, up to 23.1° | 0 to 23, up to 11.7 cm | 30, 14.8 to 23.4 cm |
| Wand: *thrust out* (clip) | 3, 3.4° | none | none |
| Wand: the five keyed ways | none | none | none |
| Rests: the clips' (talking, seated or not; scratching the head; listening; waving someone over) | none | none | none |
| Rest: *a cheer* (clip) | 2, 3.1° | none | none |
| Rests: the clerk's, reeve's and adventurer's five keyed | 0 to 30, up to 4.0° | 0 to 5, up to 9.6 cm | none |

(Seated, every rest's feet are as far into the floor on the tallest 18 bodies as the bench puts
them, clip or keyed: the seat's height isn't fitted to the body yet.)

### Performance

These are measured with software rendering, so a real GPU is faster, but the JavaScript costs are
similar.

**One character with a full outfit:**

- 22–38 draw calls (plus shadows), drawn one by one; drawn all at once, as everyone but a player
  is, its garments are one (a soldier in uniform 12 to 17 in all, about 21 to 26 before)
- about 80–100 thousand triangles
- a 1024 × 1024 skin texture with a bump map, and 512 × 512 textures for each garment (shared by
  everyone wearing it), or two for each outfit drawn all at once

**From afar** (`lod.js`): anyone drawn all at once (everyone but a player) is drawn with a quarter
of the triangles when they're under 140 pixels tall on the screen, and in full again over 170, so
one at the edge doesn't flick between them. It's a second list of triangles over the same vertices
(meshoptimizer's simplifier, `LOD`: about a quarter of them, none more than 2% of the mesh's size
out of place, the texture's layout kept so its seams stay put), so the skin weights, pictures and
bones are the same, and nothing more is posed. The body's is made once for everyone (26,756
triangles to 6,688); a body triangle of it is drawn unless all its corners are under clothes; the
eyes are drawn, the lashes not. An outfit's is made once for everyone wearing it, as they all have
the same triangles (a human soldier's about 25,400 to 6,300). They're made in a worker
(`lod-worker.js`), 20 to 30 milliseconds each on a desktop, and until one's there the character is
drawn in full. Hair and what's carried are drawn as they are (folk's hair is grown thinned
already). Twenty-four of the uniform lab's figures from afar, their hair as in the game: 1.85
million triangles a frame (with the sun's shadows) to 0.61 million, and in software rendering 2.1
seconds a frame to 0.9. At the size they switch, 0.17% of the picture's pixels change by more than
48 levels of 255, on trim, emblems and garments' edges. The simplifier is vendored
(`client/vendor/meshoptimizer-1.3.0`, MIT, `npm run vendor:meshopt`): 54 KB, 19 KB compressed,
downloaded with the game and started only in the worker (`lowerDetail` imports it when it's first
used).

**Load:**

- The body data is 1.4 MB, downloaded once. The masks are 160 KB.
- Getting the skin painter ready takes about a second.

**Changes:**

| Change | Time |
|---|---|
| Changing the body (reshaping plus refitting hair and clothes) | about 130 ms |
| Repainting the skin | about 280 ms |
| Changing equipment | about 160 ms |

The lab applies changes at most once a frame.

**Hair detail.** Characters seen from afar can grow only part of their hair (`hairDetail`, 0 to
1): fewer strands, each wider so the hair is as thick, with fewer segments. In the game (quality
levels: a fifth to 45% of the strands) this roughly halves a character's triangles: the long
style's 48,000 hair triangles become about 14,000 at high quality.

**Posing.** Posing a character each frame (its walk, what it's doing layered over it, its feet
kept on the ground and its hands reaching where they're wanted) costs, per character, in Node on
a desktop-class machine:

| | Walking | Running | On guard | Resting |
|---|---|---|---|---|
| Before | 123 µs | 129 µs | 314 µs | 256 µs |
| Now | 108 µs | 102 µs | 222 µs | 184 µs |

The poses are exactly the same, bone for bone, over 480 frames of walking, running, fighting,
resting and sitting. What went:

- **A matrix pass.** The walker worked out every node's world matrix (74 for a soldier) before
  setting the joints as well as after. Nothing between reads them but through
  `getWorldQuaternion` and the like, which work out their own, so now it's only after (the
  character's own place before, `updateWorldMatrix(true, false)`).
- **Euler angles nobody reads.** three.js works out a bone's Euler angles again every time its
  quaternion's set: a matrix made and taken apart, about a twelfth of a walking character's
  frame. Bones are posed by quaternion alone, so the rig switches that off (`Rig`: `bone.rotation`
  goes stale; setting it still sets the quaternion).
- **Allocations in the arm's reach.** `Rig.reachArm` tries 18 to 42 swivels an arm a frame, and
  each made an object; `limitRotation` found its joint's movements and made an object and a
  vector every call. Now they're found once and the rest is kept in scratch objects.
- **Sprinting curves walking.** The sprint's curves (made of keys, each read making four small
  arrays) were worked out and multiplied by nothing while walking. Now they're not, and reading
  keys makes no arrays.

**How often.** In the game, a character's posed only as often as it's seen (`Avatar.every`, from
`posingEvery`): every frame when it's 150 pixels tall on the screen or taller, and the player
always; every 2, 3 or 4 frames smaller (75, 35 pixels); every 8 when it's out of view (posed
straight away when it comes back into it). A character moving fast enough that the quickest of
it would be out by more than a pixel and a half between poses is posed more often: a foot on
the ground slides along with the body, and in the middle of a blow, a flinch or a fall its hands
are taken to go 4 metres a second (`Actions.quick`), so a fight's posed every frame unless it's
tiny. It follows its actor every frame whatever, so it goes smoothly; between poses the whole
of it moves as it was last posed, and when it's posed it's for all the time and way since. One
that casts a shadow (soldiers and folk don't; a player does) isn't taken to be out of view, as its
shadow might not be. The walk and the actions already cope with any frame's length, and
the tests check the feet stay on the ground posed every third frame.

For many enemies on screen, the next steps are:

- merging the rest of a character's parts into one mesh (its garments already are, but a player's)
- a lower-detail body: MakeHuman's proxy meshes use the same rig

## Research

Two research passes informed the engine. Some sites were blocked from the sandbox, so some values
come from search summaries; ranges marked † are standard textbook values that couldn't be checked
online.

### Joint articulation

**Normal range of motion** (American Academy of Orthopaedic Surgeons, degrees). These are the
limits in `rig.js`:

| Joint | Movements |
|---|---|
| Neck (neck + head bones) | flexion 45, extension 45, side bending 45, rotation 60 |
| Thoracolumbar spine (three bones) | flexion 80 (mostly lumbar), extension 25, side bending 35, rotation 45 (mostly thoracic: about 45 thoracic against 10 lumbar) |
| Shoulder | flexion 180, extension 60, abduction 180, internal rotation 70, external 90 |
| Shoulder girdle | clavicle elevation about 11–15 and retraction 15–29 during full arm elevation (Ludewig 2004); scapulohumeral rhythm about 2:1 |
| Elbow | flexion 150; hyperextension 0 in men, 10–15 in women |
| Forearm | pronation 80, supination 80 |
| Wrist | flexion 80, extension 70, radial deviation 20, ulnar 30 |
| Fingers | MCP 90, PIP 100, DIP 90 |
| Thumb | CMC palmar abduction 70; MCP flexion 50; IP flexion 80 |
| Hip | flexion 120 (135 in Soucie 2011's men; only about 80 with the knee straight), extension 30, abduction 45, adduction 30, rotation 45 each way |
| Knee | flexion 135–142, hyperextension 0–10; with the knee bent 90°, rotation 28 external and 13 internal (Mossberg & Smith 1983) |
| Ankle | dorsiflexion 20, plantarflexion 50; subtalar inversion 20, eversion 10 |
| Big toe | extension 70, flexion 45 |

Some limits depend on other joints, because muscles cross two joints. Hip flexion is about 120–135°
with the knee bent but about 80° with it straight, and ankle dorsiflexion is less with the knee
straight. These aren't modelled yet.

**How engines limit joints**, and what `rig.js` does:

- **Swing-twist decomposition.** q = swing · twist. The twist is q projected onto the bone's axis;
  the swing is what's left ([Baerlocher & Boulic 2001](https://infoscience.epfl.ch/record/100909),
  [Allen Chou](https://allenchou.net/2018/05/game-math-swing-twist-interpolation-sterp/)).
- **PhysX D6 joints.** An elliptical swing cone plus a twist range, or a "pyramid" of asymmetric
  limits ([PxD6Joint.h](https://github.com/NVIDIA-Omniverse/PhysX/blob/main/physx/include/extensions/PxD6Joint.h)).
- **Unity's CharacterJoint.** Symmetric swings with an asymmetric twist. The ragdoll wizard puts a
  limb's biggest movement (the elbow's bend) on the twist axis to get asymmetric ranges.
- **Ours.** The swing is limited to an ellipse, with different limits either side of each axis
  (flexion 150 but extension 0). This is like FABRIK's quadrant cones
  ([Aristidou & Lasenby 2011](https://www.andreasaristidou.com/publications/papers/FABRIK.pdf)).
  The twist has its own range.
- **IK.** Analytic two-bone IK (law of cosines, with the bend kept in its plane, or towards a pole
  given in the upper bone's anatomical frame: forward, for knees) for legs. Arms search the
  elbow's swivel round the shoulder-to-wrist line for the least strained, most natural way
  (`Rig.reachArm`, above), as arm IK solvers for animation do: the swivel angle is the arm's one
  free degree of freedom once the hand is placed.
  Three.js's CCDIKSolver clamps Euler angles per joint, which suits chains like tails.
- **Blending.** Blending two joint rotations by their swing and twist separately, each in a
  straight line (swing-twist interpolation, as in Allen Chou's article above), keeps a blend
  inside the joint's limits. A slerp of the whole rotation can leave them.

### Walking

**Phases** of one stride, from heel strike to the same foot's next heel strike (Perry & Burnfield):

| Phase | % of the stride |
|---|---|
| Loading response | 0–12 (heel rocker) |
| Mid-stance | 12–31 (ankle rocker) |
| Terminal stance | 31–50 (heel rise, forefoot rocker) |
| Pre-swing | 50–62 (toe rocker) |
| Swing | 62–100 |

Stance is about 62% of the stride at 1.37 m/s, with two double-support periods of about 12% each.

**Joint angle curves.** These are normal adult curves at a self-selected speed: the CGM2.3 normal
dataset bundled with [pyCGM2](https://github.com/pyCGM2/pyCGM2), Plug-in Gait conventions. They
are fitted as Fourier series θ(p) = a₀ + Σ aₖ cos 2πkp + bₖ sin 2πkp (errors under 1°). The
coefficients are in `gait.js`.

- **Knee:** 8° at heel strike, 21° taking the weight at 12%, 10° at 37%, 65° in swing at 71%.
- **Ankle:** 14° dorsiflexion at 45%, 15° plantarflexion at push-off (62%).
- **Hip:** flexion 37° down to extension −2° at 53%. The pelvis tips forward about 11.5°, so the
  thigh swings about +26° to −14° from vertical.
- **Pelvis:** rotates ±6°, forward with the leg. Obliquity is ±5°, and the swinging side drops.
- **Trunk:** the thorax counter-rotates ±7.7° against the pelvis. The spine bends ±9° sideways to
  cancel the pelvis's tilt, and the head stays within ±2°.
- **Shoulder:** −24° to +6°, back at the same side's heel strike. The elbow bends 26–52°.

**Speed:**

- **Walk ratio.** Step length over cadence stays about 0.0065 m per step a minute
  ([Rota 2011](https://pubmed.ncbi.nlm.nih.gov/21629125/)), so cadence ≈ √(60·v / 0.0065). At
  1.4 m/s that's about 114 steps a minute and 0.74 m steps. Both are scaled here by leg length.
- **Adult table.** For adults 18–29, normal-speed men walk at 99–113 steps a minute with
  1.35–1.66 m strides.
- **Faster walking** (Schwartz 2008, children 4–17, for the trends): the knee's swing peak rises
  from 45° to 62°, and pelvic rotation and obliquity grow.
- **Walk to run.** People break into a run at a Froude number v²/gL of about 0.5
  ([JEB 2014](https://journals.biologists.com/jeb/article/217/18/3200/12423/The-preferred-walk-to-run-transition-speed-in)),
  about 2.1 m/s for a 0.9 m leg. That's also how to scale gaits to bigger or smaller bodies.
- **Centre of mass** ([Orendurff 2004](https://pubmed.ncbi.nlm.nih.gov/15685471/)). It rises and
  falls 2.7–4.8 cm twice a stride, lowest in double support. It sways 7.0 cm at 0.7 m/s to 3.9 cm
  at 1.6 m/s, once a stride, over the standing foot.

**Techniques:**

- **Stride wheel.** Drive the gait by distance: one turn of a wheel whose circumference is the
  stride ([David Rosen, GDC 2014](https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach)).
- **Distance matching and stride warping.** Paragon's approach
  ([Laurent Delayen](https://www.gameanim.com/2016/11/29/game-anim-interview-laurent-delayen/)).
- **Foot locking.** Keep planted feet in place with IK
  ([Daniel Holden](https://theorangeduck.com/page/inverse-kinematics-foot-locking)).
- **Motion matching.** For large motion capture libraries later
  ([Simon Clavet, GDC 2016](https://www.gdcvault.com/play/1023280/Motion-Matching-and-The-Road)).
- **Retargeting relative to the rest pose.** As in
  [three-vrm](https://github.com/pixiv/three-vrm/blob/dev/packages/three-vrm-core/examples/humanoidAnimation/loadMixamoAnimation.js).
  Three.js's `SkeletonUtils.retargetClip` has known problems with Mixamo's feet and hands.

**Running** (Novacheck, *The biomechanics of running*, Gait & Posture 1998, and sprinting
studies):

- Stance is about 40% of the stride when jogging, falling with speed to about a quarter
  sprinting, with two flight phases.
- The knee bends about 40–45° in stance and 90–125° in swing, the most sprinting (the heel comes
  up towards the buttock).
- Hip flexion is about 50–55° jogging and more sprinting, the knee driving high; the hip extends
  10–20° at toe-off.
- Sprinters land on the forefoot, close under the body.
- Cadence rises from about 2.7 steps a second jogging to 4–5 sprinting: people run faster by
  taking longer steps at first, then quicker ones.
- The body is lowest in mid-stance and highest in flight, the opposite of walking.
- People walk at about 1.4 m/s and sprint at about 6.5 (untrained adults, over a short
  distance): about 4.6 times as fast. The game's running speed keeps that ratio.

### Equipment in games and engines

| System | How it works | What it solves | What we took |
|---|---|---|---|
| World of Warcraft | One skinned body with toggled sub-meshes ("geosets"). Cheap armour is painted into fixed regions of the body texture. Items hang on numbered attachment points (right palm, left palm, back, shoulders...). Helmets hide hair per race ([WoW Model Viewer](https://github.com/wowmodelviewer/wowmodelviewer)) | Many looks from one skeleton and body | Sockets on bones, helmets hiding hair, painted-on detail |
| Skyrim / Fallout | Armour claims numbered body slots; the naked body in those slots isn't drawn | Skin can never poke through | Slots, and hiding covered skin |
| Diablo II | Up to 16 pre-rendered sprite layers per frame, with a draw order stored for every direction | Paper-doll sprites | (Not needed in 3D) |
| MakeHuman (MHCLO) | Each clothing vertex is bound to three body vertices plus an offset. Items list body vertices to delete and a layer depth | Clothes fit any body shape | Garments made from the body's own surface |
| BodySlide | Conforms outfits to body sliders; "Solid Mode" moves rigid pieces as one; zaps delete hidden parts | Armour on any body | Rigid items on sockets, hidden triangles |
| UMA (Unity) | "Slots" (meshes) and "overlays" (textures) baked into one mesh; "DNA" body shapes; wardrobe recipes that hide slots | A complete open-source character system | Layers suppressing what's under them |
| Unreal | Leader Pose (parts share one skeleton's pose), Copy Pose, Mesh Merge; Mutable removes faces inside clipping volumes | Modular characters at different costs | One skeleton for everything a character wears |
| Three.js | A skeleton shared by many skinned meshes is updated once a frame; bones are read from a texture (no bone-count limit since WebGL2); morphs work with skinning, but morphs don't move bones | — | Body shapes baked into the mesh and joints moved with them; one skeleton; parts as separate draw calls for now |

**Skeleton naming.** We use Mixamo's names for the 52 deforming bones. They match the largest free
animation source, the three.js example models, Quaternius's animation library, and the rig MPFB2
ships with weights. VRM humanoid names are a good second layer for mapping other animation
sources.

### Free assets

| Asset | Where | Licence |
|---|---|---|
| MakeHuman base mesh, targets, rigs and weights | [makehuman](https://github.com/makehumancommunity/makehuman), [mpfb2](https://github.com/makehumancommunity/mpfb2) | CC0 (used here) |
| MakeHuman's animations and poses | makehuman `data/animations` | CC0 (the walk and zombie walk are used here) |
| MakeHuman clothes, hair and proxies | MakeHuman's file servers (not on GitHub any more) | Mostly CC0 or CC-BY |
| CMU motion capture (2,548 BVH clips) | GitHub mirrors, e.g. [CMU-MoCap-10-14](https://github.com/AtelierCircle/CMU-MoCap-10-14) | Free to use |
| Bandai Namco motion dataset (walks and fights in many styles) | [GitHub](https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset) | CC BY-NC 4.0 |
| Ubisoft LAFAN1 | [GitHub](https://github.com/ubisoft/ubisoft-laforge-animation-dataset) | CC BY-NC-ND 4.0 |
| Quaternius Universal Animation Library, modular outfits | quaternius.com, itch.io | CC0 (stylised) |
| Mesh2Motion's human animations (the Universal Animation Library as glTF) and creature rigs | [mesh2motion-app](https://github.com/Mesh2Motion/mesh2motion-app) `static/animations` | CC0 (five clips in the lab, ten baked into the game's attacks and rests); its `CarnegieMellonAnimations` folder is CMU's terms |
| KayKit Adventurers (characters, weapons, shields) | [GitHub](https://github.com/KayKit-Game-Assets) | CC0 (low-poly) |
| Mixamo characters and animations | mixamo.com (Adobe login) | Free in games; raw files can't be redistributed |

## What's next

- **More actions.** Blocking, dodging and picking up loot, and a staff that strikes up close and
  casts from afar.
- **More two-handed items.** Guns and two-handed swords, with the second hand as the staff's and
  hammer's; a bowstring that bends as it's drawn.
- **Loose clothing.** Robes, skirts and cloaks need their own hanging meshes.
- **Crowds.** Instancing for groups of enemies dressed alike.
- **Multiplayer.** The host's game is authoritative and other players sync to it, except for loot,
  which stays local. A character's state is small: its preset or slider values, its equipment ids,
  and its position, heading, speed and action. Every client builds the same character from it.
- **Vehicles.** Seats would be sockets, with a pose per seat.
