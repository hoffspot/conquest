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
  - Nine hairstyles, four beards, and hair and brow colour.
  - Whole texture skins: save the painted skin, paint over it, and load it back.
- **Dress and arm them.** 18 garments and 19 items go in 16 slots, with ready-made outfits
  (adventurer, knight, mage, ranger, gunner, orc raider).
- **Watch them walk and run.** Walking is made from gait-lab data, running from sprinting
  studies. You can change the speed (up to a sprint of 8.5 m/s) and the walk style, walk in a
  circle, see the joint angles through the stride, and show the skeleton.
- **Play motion capture.** Two of MakeHuman's clips, a walk and a zombie walk, are retargeted to
  whatever body you've made.
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
| `bvh.js` | Motion capture: reading BVH files and retargeting them to our skeleton |
| `presets.js` | The human, heroine and orc |
| `kit.js` | Loads everything characters share, once |

The lab itself is `client/character-lab.html`, `character-lab.css` and `client/js/lab/character-lab.js`.

### The body

The body is MakeHuman's base mesh (`hm08`), taken from its Blender add-on
[MPFB2](https://github.com/makehumancommunity/mpfb2), whose assets are CC0.
`npm run build:characters -- --mpfb2=../mpfb2` prepares it.

- **Parts.** The build keeps the body (13,380 vertices), and the eyes and eyelashes (which
  MakeHuman keeps as "helper" meshes).
- **Bones.** It keeps the 52-bone Mixamo rig and its skin weights (the four strongest per vertex).
- **Body shape.** The build also keeps 60 shapes ("targets") behind the gender, muscle, weight,
  height and heritage sliders. They are stored as their principal components: 29 of them
  reproduce all 60 exactly.
- **Face and physique.** 76 sparse shapes sit behind the face and physique sliders.
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
  on (brows, stubble, a buzz cut or the scalp under longer hair). It also makes a bump map.

**Eyes.** Eyes are painted too (iris fibres, limbal ring, pupil or slit, sclera). They are drawn
on MakeHuman's eye helper mesh with a glossy clear coat.

**Hair.** Hair is thousands of thin strips (hair cards) with a strand texture, grown from roots
spread over the scalp above the style's hairline:

1. Each strand leaves the scalp in the style's direction: from the crown, combed back, parted,
   up, or to a tie or knot.
2. It bends under gravity.
3. It is kept just outside the head, which is measured as its radius in every direction. The neck
   and shoulders are ellipsoids that long hair falls over.
4. Each strand gets its own layer, and is darker at its roots.

Hair near the head is skinned to the head; long hair hands over to the neck and upper back.
Beards grow from the jaw the same way, lying along the face. Under a helmet or hat, only hair from
below the rim is grown, so long hair hangs from under a helmet.

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
   not jagged along the mesh.
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
   body's texture layout (cloth, leather, quilting, mail, plate, embroidered trim).
6. **Hiding.** Skin under a garment isn't drawn, and neither is a garment under another one.
   Layers go underwear, clothing, mid layer, armour, belts and straps.

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

The tavern's folk wear them: wool, green and red skirts, a velvet gown, and the barkeep's apron,
over a chemise (low-necked, short-sleeved) and a laced bodice (a band from under the waist to over
the bust, painted with a cord criss-crossing down the front).

**Items** (`items.js`) are rigid models on **sockets**, points on bones placed from the body's
shape:

- the palm of either hand, with the grip across it
- the outside of the left forearm, for shields
- the middle of the head, for helmets, sized to fit it
- the upper back, for packs, quivers and slung guns
- inside the lower lip, for tusks

An item can bring a garment: a backpack brings its straps, spiked gauntlets their plate
gauntlets. It can hide things: a helmet hides the hair above its rim. It can also set how its arm
is carried when walking: a shield across the body, a staff or war hammer upright, a sword or
wand lowered, a grimoire open on the palm, fists clenched, with less arm swing and a gripping
fist.

The game's weapons are items too: a sword, a mage's staff, a crystal-tipped wand, an open
grimoire (in the left hand, the right hand free to cast), a two-handed war hammer, a longbow with
a quiver of arrows on the back, spiked knuckle plates over plate gauntlets (one for each hand),
and the orc's notched cleaver. Every character starts in the same outfit: a tunic, leather
bracers, leather pants and leather boots.

**Slots:** head, face, under top, shirt, chest, armour, forearms, hands, waist, underwear, legs,
apron, shins, feet, back, main hand and off hand. One piece per slot.

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
  a hammer blow), which the legs bend to follow.

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

**Spells** are cast the same way, with the free left hand (the right keeps hold of the weapon),
key 1 being when the spell takes effect:

| Spell | The first way | And four more |
| --- | --- | --- |
| Heal (`castHeal`) | Lifted up: the hand gathers the light before the chest, head bowed; then lifts it up and open, looking up | from the heart, a circle, a rising sweep, from the earth |
| Stun (`castStun`) | A palm thrust: the hand drawn back by the left shoulder, turning away; then thrust open-palmed at the enemy, leaning in | pointed from above, a cross-body flick, a double push, a rising sweep |

The light of a spell, and the bolts and fireballs a wand or grimoire throws, have five looks
each too, chosen the same way (see [GAME.md](GAME.md), Effects).

On guard (while fighting), each weapon is held ready: the sword upright in front, the staff and
hammer across the body in both hands, the fists up, the book open.

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
  as near the original choreography as they could. The war hammer's haft ends 26 cm below the
  right hand, with the rear hand at its end, as a two-handed hammer is held.

The tests go through every attack, cast, rest and guard, holding what each is done with, a tenth
of the way at a time and at each key, and check that:

- every elbow, forearm and wrist stays in its range;
- each shoulder is in range at the key poses (within 5°), and only a little past it (under 20°),
  briefly, mid-swing;
- each hand is turned as its keys ask, straining under 35°;
- the thumb closes over the fingers round a grip, and both fists close round a two-handed shaft;
- nothing held sinks into the body.

**Reactions** to being hit are functions of time and of where the blow came from (which side,
front or back), added to whatever pose the character is in, so a flinch during an attack still
shows the attack. Each kind of blow (weapons.js: an attack's `reaction`) has its own, and its own
effect where it lands, so how a character reacts depends on what hit it:

| Blow | Reaction | Effect |
| --- | --- | --- |
| slash (sword) | twists away from the blade, head snapping away | sparks |
| strike (staff) | rocks back, head thrown back | dust |
| arcane (wand) | a shudder through the whole body | violet light |
| fire (grimoire) | flinches back, arms up to shield the face | fire |
| crush (war hammer) | doubled over, knees buckling, knocked back | a flash and dust |
| pierce (bow) | a sharp jolt at the chest (and the arrow sticks) | sparks |
| punch (gauntlets) | the head snaps round | a flash and dust |
| hack (orc cleaver) | a heavy cut that twists and staggers | sparks |

To give a new attack its own reaction, add an entry to `REACTIONS` and name it in the attack.
A new attack needs its five ways (`ATTACKS[name].variants`: a name and key poses each); the tests
check each lands in front at a fighting height.

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

### Resting

How each class of character passes the time (`RESTS`, by class: the game's roles, core/roles.js,
which name and time them): five ways each, key poses timed like an attack's (key 1 at the moment
that matters: the top of a toast, a slap on the table), played every several seconds while the
player can see them, and by the player after standing still a while. `rest(role)` plays one of
a class's rests, any at first and then any but the last; `stopResting()` eases out of it (in
0.35 s). A patron rests sitting down.

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
| Adventurer | stretching | both arms up high, the back arched |
| | looking about | a hand shading the eyes, one way then the other |
| | rolling the shoulders | the shoulders rolled up and back, the neck stretched each way |
| | a yawn | a hand to the mouth, the head back, the shoulders up |
| | shifting the weight | from one foot to the other, a thumb in the belt |

The lab's Motion tab has them (Resting: a class, the way from Fighting's Way, Rest), and
`?action=rest&rest=barkeep&way=2&at=1` shows one frozen.

**Motion capture** (`bvh.js`) is retargeted bone by bone in the world:

1. Pose the BVH skeleton and take each joint's world rotation, in our axes.
2. Line our bone up with its BVH bone at rest, then apply that rotation.
3. Turn each bone's rotation relative to its parent into an anatomical joint rotation, within its
   range.

The clip's hip height is scaled by leg length. The character moves at the speed the clip's feet
push back. The lab has two of MakeHuman's clips (CC0); other clips need a bone name map like
`MAKEHUMAN_NAMES`, for example for CMU's.

### Performance

These are measured with software rendering, so a real GPU is faster, but the JavaScript costs are
similar.

**One character with a full outfit:**

- 22–38 draw calls (plus shadows)
- about 80–100 thousand triangles
- a 1024 × 1024 skin texture with a bump map, and 512 × 512 textures for each garment (shared by
  everyone wearing it)

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

For many enemies on screen, the next steps are:

- merging a character's parts into one mesh
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
| KayKit Adventurers (characters, weapons, shields) | [GitHub](https://github.com/KayKit-Game-Assets) | CC0 (low-poly) |
| Mixamo characters and animations | mixamo.com (Adobe login) | Free in games; raw files can't be redistributed |

## What's next

- **More actions.** Blocking, dodging and picking up loot, and a staff that strikes up close and
  casts from afar.
- **More two-handed items.** Guns and two-handed swords, with the second hand as the staff's and
  hammer's; a bowstring that bends as it's drawn.
- **Loose clothing.** Robes, skirts and cloaks need their own hanging meshes.
- **Crowds.** Merged meshes and lower-detail bodies for groups of enemies.
- **Multiplayer.** The host's game is authoritative and other players sync to it, except for loot,
  which stays local. A character's state is small: its preset or slider values, its equipment ids,
  and its position, heading, speed and action. Every client builds the same character from it.
- **Vehicles.** Seats would be sockets, with a pose per seat.
