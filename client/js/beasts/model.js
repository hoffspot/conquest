// A creature drawn from a model (a glTF in the catalog, built by utilities/blenderpipeline), in
// place of the one built in code that stands in for it until the model's read: the asset
// streaming plan's A3 (generated/asset_streaming_plan.md §11.2). A body as BeastAvatar takes one
// (its `plan`): the model's clips posed each frame from what the game asks of a body (poseOf:
// walking, attacking, flinching, resting, flying, dying), its detail packed into it (one level
// shown at a time: showLevel), its shadow cast by its least detailed one only (drawn unseen when
// it isn't the one shown), and its fire breathed from its mouth (beasts/breath.js).

import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { ASSETS } from "../app/assets.js";
import { hashed } from "../app/catalog.js";
import { readGltf } from "../world/art/engine/models.js";
import { candidatesAt, tierAt } from "../core/creatures.js";
import { THEMES } from "../core/dungeons/themes.js";
import { landAt } from "../core/worldplan/plan.js";
import { boulderGeometry, boulderMaterial } from "../world/boulder.js";
import { BEAMS, EnergyBreath } from "./beam.js";
import { Breath } from "./breath.js";

// One of a hell's flayed (MODELS): its catalog entry, how long and tall it's made, how much bigger
// it's drawn (`scale`), its ways of attacking and its special ones; the rest as all of them have it
const flayed = (asset, made, scale, attacks, specials) => Object.freeze({
    asset,
    length: +(made.long * scale).toFixed(3),
    made: Object.freeze(made),
    clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
    attacks: Object.freeze(attacks),
    specials: Object.freeze(specials),
    rests: Object.freeze({ look: "Idle 2" }),
    fire: Object.freeze({}),
    joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_l", left: "hand_l" }),
    mouth: null,
    pace: +(1.36 * scale).toFixed(2),
    runPace: +(3.43 * scale).toFixed(2),
    flinch: 0.6,
});

// One of the rift's own small kind (MODELS): the Kaiju's model drawn `long` metres long, its walk's
// pace and its run's as much smaller, attacking its `attacks` and `specials` ways; no beam
const rift = (long, attacks, specials) => Object.freeze({
    asset: "beast-kaiju",
    length: long,
    made: Object.freeze({ long: 36, tall: 13 }),
    clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Faint" }),
    attacks: Object.freeze(attacks),
    specials: Object.freeze(specials),
    spans: Object.freeze({ bite: Object.freeze([0, 1.6]), breath: Object.freeze([0, 4.6]) }),
    rests: Object.freeze({ roar: "Roar" }),
    fire: Object.freeze({}),
    joints: Object.freeze({ torso: "Spine002", body: "Hip", head: "Head", mouth: "lipjaw", left: "FFoot_L" }),
    mouth: null,
    beam: false,
    pace: +((3.1 * long) / 36).toFixed(2),
    runPace: +((16 * long) / 36).toFixed(2),
    flinch: 1.3,
});

// One of a hell's gorgers (MODELS), as `flayed`: no run, its maw biting, spewing and roaring
const gorger = (asset, made, scale, attacks) => Object.freeze({
    asset,
    length: +(made.long * scale).toFixed(3),
    made: Object.freeze(made),
    clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Gethit", dead: "Death" }),
    attacks: Object.freeze(attacks),
    specials: Object.freeze({ bite: "Bite", spew: "Spew", call: "Roar" }),
    rests: Object.freeze({ roar: "Roar" }),
    fire: Object.freeze({}),
    joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "spine_03", mouth: "jaw_up", left: "hand_l" }),
    mouth: null,
    pace: +(1.53 * scale).toFixed(2),
    runPace: null,
    flinch: 0.6,
});

// One of a hell's walkers (MODELS): Monster4's model ("Walking Villain"), made 2 metres tall and
// drawn so, in the skins its level's wear (`skins`); its own clips: its claws raked, its flinch,
// its fall; walking at 1.22 m/s and running at 3.25. (Not the idle and run its pack's demo
// retargets from Unreal's template: Epic's, for Unreal Engine only)
const walker = (skins) => Object.freeze({
    asset: "beast-hellwalker",
    skins: Object.freeze(skins),
    length: 0.43,
    made: Object.freeze({ long: 0.43, tall: 1.99 }),
    clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
    attacks: Object.freeze({ rake: "Attack" }),
    specials: Object.freeze({}),
    rests: Object.freeze({}),
    fire: Object.freeze({}),
    joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "head", left: "hand_l" }),
    mouth: null,
    pace: 1.22,
    runPace: 3.25,
    flinch: 0.6,
});

// One of the orcs on a dungeon's throne (MODELS): one of the Orc's dressings (its catalog entry),
// made 1.81 metres tall and drawn `scale` times that; its own clips: its great axe swept, chopped
// down or spun round low, one at random each time (each blow nearly two fifths of the way
// through its clip), its flinch, its battlecry and its chest thumped as it rests, looking about;
// its fall Mesh2Motion's (CC0), staggering, dropping to its knees and pitching onto its face.
// Walking at 0.94 m/s as it's made, its run a heavy jog (1.15), played faster at its chase
const orc = (asset, scale) => Object.freeze({
    asset,
    length: +(0.96 * scale).toFixed(3),
    made: Object.freeze({ long: 0.96, tall: 1.81 }),
    clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
    attacks: Object.freeze({ sweep: "Attack Sweep", chop: "Attack Chop", spin: "Attack Spin Low" }),
    specials: Object.freeze({}),
    rests: Object.freeze({ roar: "Battlecry", thump: "Chest Thump", look: "Idle Looking" }),
    fire: Object.freeze({}),
    joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "head", left: "hand_l" }),
    mouth: null,
    pace: +(0.94 * scale).toFixed(2),
    runPace: +(1.15 * scale).toFixed(2),
    flinch: 0.6,
});

// The Orc King and his champions (MODELS): the Orc's fanciest dressing (the catalog's
// beast-orc-king), in its `skins`, drawn `scale` times 1.81 metres tall, as the orcs on a throne
// are (orc) but each blow its own clip (weapons.js NATURAL orcKing, orcChampion): his axe chopped
// down, swept, backhanded; a combo of three blows (Combo 2) and a flurry of two ending in a kick
// (a chain of Combo 3 and Kick 2); a kick alone; his axe spun high all round him; his leap (Leap
// Attack: springing up a quarter of the way through it, coming down past half way, its clip
// lifting him a metre); his battlecry, rallying his champions; each through as much of its clip
// as `spans` says. On guard (beast.js actions.guard), his Block held, his Block Hit as a blow's
// caught on it (`guard`)
const kingly = (scale, skins = null) =>
    Object.freeze({
        ...orc("beast-orc-king", scale),
        ...(skins ? { skins: Object.freeze(skins) } : {}),
        attacks: Object.freeze({}),
        specials: Object.freeze({ chop: "Attack Chop", sweep: "Attack Sweep", backhand: "Attack Backhand", combo: "Combo 2", kick: "Kick 2", spin: "Attack Spin High", leap: "Leap Attack", rally: "Battlecry" }),
        spans: Object.freeze({ backhand: Object.freeze([0.35, 2.4]), combo: Object.freeze([0.5, 3.3]), spin: Object.freeze([0.15, 2.6]), leap: Object.freeze([0.3, 2.8]) }),
        chains: Object.freeze({ flurry: Object.freeze([Object.freeze({ clip: "Combo 3", from: 0.5, to: 2 }), Object.freeze({ clip: "Kick 2", from: 0.3, to: 1.25 })]) }),
        rests: Object.freeze({ thump: "Chest Thump", look: "Idle Looking" }),
        guard: Object.freeze({ hold: "Block", struck: "Block Hit" }),
    });

/**
 * The creatures drawn from a model, by their LOOKS id (which stands in for one until it's read):
 * the catalog's entry (`asset`: two kinds may be drawn from one), and the skins one of them may
 * wear (`skins`: "" its own, or one of the catalog's "<asset>-skins", <name>.<skin>.bin, only the
 * textures that differ; by its seed); how long it's drawn (metres) and how long and tall it's made
 * (and how far above where it is it's made standing, `sink`: sunk that far to the ground); which
 * of its clips are what (`clips`: `hover`, hanging in the air, battle.js #hover; `run`, running;
 * `react` and `dead`, its flinch and its fall, if it has them: fallOf), and its ways of
 * attacking (`attacks`, the special ones `specials`, as named: weapons.js `animation`; up in the
 * air, `aloft`'s in their place; each played through the whole of its clip, or through as much
 * of it as `spans` says, [from, to] seconds; or a way that's a chain of its clips, `chains`, each
 * link { clip, from, to } seconds of it, played one after another, each eased into the next) and
 * resting (`rests`), each a clip; what it carries in a hand through a way of its own (`carry`, by
 * that way: a boulder, { bone it's held by, from and to (how far through the way, 0 to 1, it's
 * held), radius (metres, as it's made), at ([x, y, z] metres from the bone, as it's made) }); when in a clip it breathes
 * fire (`fire`, by clip: seconds into it) and from where (`mouth`, if it does); its joints for the
 * game's (`joints`: beast.js BONES' names, by the model's bones' names as the glTF loader gives
 * them); and how fast (metres a second, as it's drawn) it goes when its walk plays at its own pace
 * (`pace`), and its run (`runPace`). One drawn from a model that breathes a beam (beasts/beam.js
 * BEAMS, by its catalog entry) breathes it too, unless it's said not to (`beam`: false). One that
 * stands on guard (battle.js #onGuard) holds its guard up in a clip of its own (`guard`: `hold`,
 * looped) and braces behind it in another as a blow's caught on it (`struck`).
 */
export const MODELS = Object.freeze({
    // (The Behemoth of the Rift: drawn 36 metres long, as it's made. Its jaws slammed down (the
    // start of its Roar, its head reared and brought down), its roar, and its atomic breath (its
    // Energy Breath, the beam it breathes drawn from its catalog's entry: beasts/beam.js BEAMS),
    // each played as far into its clip as the move lasts (weapons.js NATURAL kaiju), at its own
    // pace; its flinch the start of its Hit React; falling in its Faint, held where it lies. No
    // run: it walks, its walk's own pace a little faster than it ever goes)
    kaiju: Object.freeze({
        asset: "beast-kaiju",
        length: 36,
        made: Object.freeze({ long: 36, tall: 13 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Hit React", dead: "Faint" }),
        attacks: Object.freeze({}),
        specials: Object.freeze({ slam: "Roar", roar: "Roar", breath: "Energy Breath" }),
        spans: Object.freeze({ slam: Object.freeze([0, 1.6]), roar: Object.freeze([0, 7.6]), breath: Object.freeze([0, 6]) }),
        rests: Object.freeze({}),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Spine002", body: "Hip", head: "Head", mouth: "lipjaw", left: "FFoot_L" }),
        mouth: null,
        pace: 3.1,
        flinch: 1.3,
    }),
    // (The Stone Golem of Harrowstone (creatures.js): Alexander Lenski's Armored Stone Golem, made
    // 1.85 metres tall and drawn 4, in its own stone (its ember, moss and frost skins kept for
    // something rarer); its own clips: its hammer thrust down over its shoulder (its smash, Attack 3),
    // swept round at its side (its sweep, Attack 1, to the end of its swing) and brought down on the
    // ground as it crouches (its pound, the end of Attack 5); a boulder torn out of the ground and
    // hurled (its heave: that crouch, its hammer driven into the ground and its other hand down,
    // then its shield arm swung up and over, Attack 2's, the boulder held in that hand from the
    // crouch to where it's let go); its flinch and its fall; standing about now and then (Idle 2 to
    // 4). Walking at 2.27 m/s as it's drawn; no run, its walk played faster as it chases)
    stoneGolem: Object.freeze({
        asset: "beast-golem",
        length: 1.94,
        made: Object.freeze({ long: 0.9, tall: 1.85 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Hit 1", dead: "Death 1" }),
        attacks: Object.freeze({}),
        specials: Object.freeze({ smash: "Attack 3", sweep: "Attack 1", pound: "Attack 5" }),
        spans: Object.freeze({ sweep: Object.freeze([0, 2.3]), pound: Object.freeze([1.85, 3.2]) }),
        chains: Object.freeze({
            heave: Object.freeze([Object.freeze({ clip: "Attack 5", from: 2, to: 2.6 }), Object.freeze({ clip: "Attack 2", from: 0.45, to: 1.6 })]),
        }),
        carry: Object.freeze({ heave: Object.freeze({ bone: "hand_l", from: 0.26, to: 0.75, radius: 0.22, at: Object.freeze([0, -0.06, 0.16]) }) }),
        rests: Object.freeze({ look: "Idle 2", shift: "Idle 3", stretch: "Idle 4" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_r", left: "hand_l" }),
        mouth: null,
        pace: 2.27,
        runPace: null,
        flinch: 0.6,
    }),
    // (The rift's own small kind in the Tower of Sar Mordal, drawn from the Kaiju's model: a
    // riftling 4.2 metres long, a man's height; a rift stalker 7. Running as the Kaiju never does;
    // a riftling's bite and a stalker's the start of its Roar, its jaws brought down, as the
    // Behemoth slams them; a stalker's green fire breathed in its Energy Breath, its jaws wide, as a
    // drake's is (app/game.js BREATHED), not the Behemoth's beam (`beam`: none); roaring as they rest)
    riftling: rift(4.2, { bite: "Roar" }, {}),
    riftStalker: rift(7, { bite: "Roar" }, { breath: "Energy Breath" }),
    dreadthorn: Object.freeze({
        asset: "beast-dreadthorn",
        length: 17,
        made: Object.freeze({ long: 10, tall: 2.27 }),
        clips: Object.freeze({ idle: "Idling", walk: "Crawling", fly: "Flying", glide: "Gliding", hover: "Hovering", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Bite", claw: "Claw", tailSweep: "Tail Sweep" }),
        specials: Object.freeze({ breath: "Fire Breath" }),
        aloft: Object.freeze({ breath: "Hover Breath" }),
        rests: Object.freeze({ roar: "Roar" }),
        fire: Object.freeze({ "Fire Breath": [1.0, 2.8], "Hover Breath": [1.0, 2.8] }),
        joints: Object.freeze({ torso: "Spine002", body: "Hip", head: "Head", mouth: "lipjaw", left: "Wing_L" }),
        mouth: Object.freeze({ upper: "lip", lower: "lipjaw", hinge: "Jaw" }),
        pace: 3.2,
        // (How much of a flinch's clip a flinch plays, seconds: its first start)
        flinch: 0.8,
    }),
    // (The werewolf: drawn 2.4 metres tall, as it's made, its body and two lengths of fur a level
    // of detail; in its own grey skin or the dusk's, the ash's or the russet's; its claws raking,
    // or springing on whoever it's after (its leap); howling and looking about as it rests)
    werewolf: Object.freeze({
        asset: "beast-werewolf",
        skins: Object.freeze(["", "dusk", "ash", "russet"]),
        length: 1.36,
        made: Object.freeze({ long: 1.36, tall: 2.4 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ claw: "Claw" }),
        specials: Object.freeze({ pounce: "Attack" }),
        rests: Object.freeze({ howl: "Howl", look: "Idle Alert" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_r", left: "hand_l" }),
        mouth: null,
        pace: 1.45,
        runPace: 2.6,
        flinch: 0.6,
    }),
    // (The Moonfang, the werewolves' master: the werewolf's model, drawn 3.4 metres tall, always in
    // the moonfang's skin, black with a pale glow; its stride as long again as it's bigger)
    moonfang: Object.freeze({
        asset: "beast-werewolf",
        skins: Object.freeze(["moonfang"]),
        length: 1.93,
        made: Object.freeze({ long: 1.36, tall: 2.4 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ claw: "Claw" }),
        specials: Object.freeze({ pounce: "Attack" }),
        rests: Object.freeze({ howl: "Howl", look: "Idle Alert" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_r", left: "hand_l" }),
        mouth: null,
        pace: 2.06,
        runPace: 3.69,
        flinch: 0.6,
    }),
    // (The ants' nests' own (dungeons/themes.js `nest`). A giant ant, drawn 1.5 metres long, as
    // it's made: rearing to bite; resting, looking about, drinking, rearing up. It has no flinch
    // nor fall of its own: it borrows the Ant Monster's (`borrows`), once both models are read;
    // till then, struck, it doesn't flinch, and dead, it rolls onto its back (poseOf, fallOf))
    ant: Object.freeze({
        asset: "beast-ant",
        length: 1.5,
        made: Object.freeze({ long: 1.58, tall: 0.51 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        // (Its body the Ant Monster's pelvis, its belly the segments of its tail, each leg's three
        // bones the first three of the Ant Monster's four; carried as its pelvis is)
        borrows: Object.freeze({
            from: "antMonster",
            clips: Object.freeze(["Hit React", "Death"]),
            carried: Object.freeze(["Root", "Bip001_Pelvis"]),
            bones: Object.freeze({
                Chest: "Bip001_Pelvis",
                Head: "Bip001_Head",
                Spine_01st: "Bn_tail",
                Spine_02nd: "Bn_tail_01",
                Hip_01st: "Bn_tail_02",
                Hip_02nd: "Bn_tail_03",
                Hip_03rd: "Bn_tail_04",
                Hip_04th: "Bn_tail_05",
                Feeler_L_01st: "Bn_Cirrus_L_00",
                Feeler_R_01st: "Bn_Cirrus_R_00",
                Fang_L: "Bn_Tooth_L",
                Fang_R: "Bn_Tooth_R",
                ...Object.fromEntries(
                    [["Front", "F"], ["Middle", "M"], ["Back", "B"]].flatMap(([pair, short]) =>
                        ["L", "R"].flatMap((side) => ["01st", "02nd", "03rd"].map((bone, k) => [`Leg_${pair}_${side}_${bone}`, `Bn_Leg_${side}_${short}_0${k}`])),
                    ),
                ),
            }),
        }),
        attacks: Object.freeze({ bite: "Attack" }),
        specials: Object.freeze({}),
        rests: Object.freeze({ look: "Idle 2", drink: "Drink", rear: "Play 2" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Chest", body: "Root", head: "Head", mouth: "Fang_R", left: "Leg_Front_L_03rd" }),
        mouth: null,
        pace: 0.62,
        runPace: 1.55,
        flinch: 0.5,
    }),
    // (A great centipede: the centipede's model, made 6.7 metres long, drawn 4; made standing a
    // little above where it is, sunk to the ground (`sink`, metres as it's made); its fangs, or
    // rearing to strike down; resting, looking about or eating)
    greatCentipede: Object.freeze({
        asset: "beast-centipede",
        length: 4,
        made: Object.freeze({ long: 6.69, tall: 0.95 }),
        sink: 0.42,
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Attack" }),
        specials: Object.freeze({ rear: "Attack 2" }),
        rests: Object.freeze({ look: "Idle 2", eat: "Eat" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Bone_Body_01", body: "Body", head: "Bone_head", mouth: "Bone_Mouth", left: "Bone_Leg_L001" }),
        mouth: null,
        pace: 0.42,
        runPace: 0.96,
        flinch: 0.5,
    }),
    // (A dungeon spider: made 1.43 metres long, legs and all, drawn 1.8; biting, springing (its
    // leap: Attack 2), spitting its web (its forelegs flung out: Attack 3); resting, rearing up or
    // eating; dead, flipped over, its legs curled)
    dungeonSpider: Object.freeze({
        asset: "beast-dungeon-spider",
        length: 1.8,
        made: Object.freeze({ long: 1.43, tall: 0.4 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Attack", snap: "Attack 5" }),
        specials: Object.freeze({ leap: "Attack 2", web: "Attack 3" }),
        rests: Object.freeze({ rear: "Roar", eat: "Eat" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "bone_abdomen_01", body: "body_COM", head: "bone_head_01", mouth: "bone_R_chelicerae_02", left: "bone_L_leg01_tarsus_01" }),
        mouth: null,
        pace: 0.54,
        runPace: 1.07,
        flinch: 0.5,
    }),
    // (An elite dungeon spider: its own model, red and black, its markings glowing (its own
    // emissive map); made 3 metres long, drawn 2.8, standing a little above where it's made, sunk
    // to the ground; its fangs, its sting brought over (its belly curled forward: Attack 2), its web
    // sprayed from its spinnerets (Butt Attack); resting, looking about or cowering; bursting apart
    // as it dies (its Explode, its only fall). Its walk carries it as fast as it ever goes: no run)
    eliteDungeonSpider: Object.freeze({
        asset: "beast-elite-dungeon-spider",
        length: 2.8,
        made: Object.freeze({ long: 3, tall: 0.77 }),
        sink: 0.09,
        clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Hit React", dead: "Explode" }),
        attacks: Object.freeze({ bite: "Attack", lunge: "Attack 3" }),
        specials: Object.freeze({ sting: "Attack 2", web: "Butt Attack" }),
        rests: Object.freeze({ look: "Idle 2", cower: "Scared" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Bip001_Spine", body: "Bip001_Pelvis", head: "Bip001_Head", mouth: "Bip001_Head", left: "Bn_L_Leg_A04" }),
        mouth: null,
        pace: 0.87,
        flinch: 0.6,
    }),
    // (A dungeon scorpion: made 1.95 metres long, its tail raised over its back, drawn 2.4; its
    // pincers thrust out or snapping, its sting brought over (Attack 3); resting, rearing up, its
    // pincers raised; flinching to its left; dead, flipped onto its back (Death 2). Its walk a slow
    // creep, its run what carries it after anyone)
    dungeonScorpion: Object.freeze({
        asset: "beast-dungeon-scorpion",
        length: 2.4,
        made: Object.freeze({ long: 1.95, tall: 1.25 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React Left", dead: "Death 2" }),
        attacks: Object.freeze({ pinch: "Attack", grab: "Attack 2", snap: "Attack 4" }),
        specials: Object.freeze({ sting: "Attack 3" }),
        rests: Object.freeze({ rear: "Roar" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Bip001_Spine", body: "Bip001_Pelvis", head: "Bip001_Neck", mouth: "Bone_mouth00", left: "Bip001_L_Hand" }),
        mouth: null,
        pace: 0.17,
        runPace: 0.66,
        flinch: 0.6,
    }),
    // (A giant cockroach: made 2.3 metres long, its feelers and all, drawn 2; biting (its Bite,
    // lunging, head down, made for it), pawing with its forelegs, or rearing up to strike down
    // (its Rear Strike, made for it); resting, eating, feeling about or cleaning itself; dead, on
    // its back, its legs twitching)
    giantCockroach: Object.freeze({
        asset: "beast-giant-cockroach",
        length: 2,
        made: Object.freeze({ long: 2.32, tall: 1.07 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Bite", paw: "Attack" }),
        specials: Object.freeze({ rear: "Rear Strike" }),
        rests: Object.freeze({ eat: "Eating", feel: "Idle 4", clean: "Idle 2" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Torso", body: "COG", head: "Head", mouth: "Head", left: "Legs_Front4L" }),
        mouth: null,
        pace: 0.96,
        runPace: 1.66,
        flinch: 0.5,
    }),
    // (A dungeon wasp: made 0.8 metres long, its abdomen curled under it, drawn 1.3, hovering over
    // where it is as it's made (its falls drop it to the ground there); stinging, jabbing, lunging,
    // or diving in from above (Attack 3); resting, hanging there, its sting out (Idle 2); its flight
    // what carries it, its wings beating the faster the faster it goes)
    dungeonWasp: Object.freeze({
        asset: "beast-dungeon-wasp",
        length: 1.3,
        made: Object.freeze({ long: 0.8, tall: 1.34 }),
        clips: Object.freeze({ idle: "Idle", walk: "Fly", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ sting: "Attack", jab: "Attack 2", lunge: "Attack 4" }),
        specials: Object.freeze({ dive: "Attack 3" }),
        rests: Object.freeze({ hang: "Idle 2" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Bip01_Spine", body: "Bip01_Pelvis", head: "Bip01_Head", mouth: "Bip01_Head", left: "BN_Foot_L_01" }),
        mouth: null,
        pace: 1.4,
        flinch: 0.5,
    }),
    // (A black widow: made 1.79 metres long, legs and all, drawn 2.2; rearing to bite, or pouncing
    // (Attack 3: a leap of 1.7 metres as it's made, and back); resting, shifting its legs; dead,
    // flipped onto its back, its legs curled. Lurking, hanging from its thread in the dark under
    // a nest's roof, and dropping on it onto whoever passes beneath (`lurk`: its Web Ground, made
    // hanging with its middle `top` metres up, sliding down its thread `fall` metres a second,
    // touching the ground `lands` seconds in, on its feet by its `end`; battle.js #lurk))
    blackWidow: Object.freeze({
        asset: "beast-black-widow",
        length: 2.2,
        made: Object.freeze({ long: 1.79, tall: 0.37 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Attack" }),
        specials: Object.freeze({ leap: "Attack 3" }),
        rests: Object.freeze({ shift: "Idle 3", feel: "Idle 4" }),
        lurk: Object.freeze({ clip: "Web Ground", top: 4.92, fall: 1.163, lands: 3.45, end: 4.97 }),
        // (Its full detail only: its bristles don't simplify, so the pipeline packs no lower ones)
        detail: 1,
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Torso", body: "COG", head: "Head", mouth: "Fang2R", left: "FrontLeg4L" }),
        mouth: null,
        pace: 0.68,
        runPace: 1.83,
        flinch: 0.6,
    }),
    // (The Ant Monster, the nests' great queen: made 6.8 metres long, drawn 4.2, 1.5 metres tall;
    // its mandibles, rearing to slam down, its acid spat, and its flock called (its call: battle.js
    // #calls); resting, looking about, swaying, rearing in threat. Its walk carries it as fast as
    // it ever goes: no run)
    antMonster: Object.freeze({
        asset: "beast-ant-monster",
        length: 4.2,
        made: Object.freeze({ long: 6.81, tall: 2.42 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Hit React", dead: "Death" }),
        attacks: Object.freeze({ bite: "Attack", strike: "Attack 5" }),
        specials: Object.freeze({ slam: "Attack 2", spit: "Attack 3", call: "Call Flock" }),
        rests: Object.freeze({ look: "Idle 2", sway: "Idle 3", rear: "Attack 4" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "Bip001_Spine1", body: "Bip001_Pelvis", head: "Bip001_Head", mouth: "Bn_Tooth_R", left: "Bn_Leg_L_F_03" }),
        mouth: null,
        pace: 2.34,
        flinch: 0.8,
    }),
    // (The Lord of the Pit, a hell's throne's (dungeons/themes.js `hell`): the Infernal Demon,
    // drawn as it's made, 3.2 metres tall (3.5 to its wings' tips), its wings spread 5.2 and
    // burning; its own clips: its claws swept one way or the other (its smash), hellfire flung
    // from its hands as it opens them (its spell, weapons.js's "wand"). Walking at 1.62 m/s; its
    // run a sprint (5.88), played slower at its chase. In its own red: its green kept for
    // something rarer (the catalog's skins))
    demonLord: Object.freeze({
        asset: "beast-infernal",
        length: 1.92,
        made: Object.freeze({ long: 1.92, tall: 3.51 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
        attacks: Object.freeze({ claw: "Attack L", rake: "Attack R" }),
        specials: Object.freeze({ wand: "Spell In" }),
        rests: Object.freeze({}),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_r", left: "hand_l" }),
        mouth: null,
        pace: 1.62,
        runPace: 5.88,
        flinch: 0.5,
    }),
    // (The River of Fire's master (dungeons/themes.js `hell`), the Lord of the Pit's before: the
    // Greater Demon, made 2.5 metres tall, drawn 3.2, its wings spread 5 metres; a human's moves
    // played on its skeleton (utilities/blenderpipeline's clips), its wings beating to them:
    // raking with its claws or punching (its smash), hellfire hurled from its fist as it punches
    // (weapons.js's "wand"); roaring as it rests. Its run's a sprint: at its chase it's played
    // slower)
    greaterDemon: Object.freeze({
        asset: "beast-greater-demon",
        length: 1.78,
        made: Object.freeze({ long: 1.41, tall: 2.53 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
        attacks: Object.freeze({ claw: "Claw", punch: "Punch" }),
        specials: Object.freeze({ wand: "Punch" }),
        rests: Object.freeze({ roar: "Roar" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "hand_r", left: "hand_l" }),
        mouth: null,
        pace: 1.03,
        runPace: 5.7,
        flinch: 0.5,
    }),
    // (A fiend of the hells' (dungeons/themes.js `hell`): Monster4, made 2.1 metres tall, drawn
    // 2.4, its wings spread 3.7 metres; its own clips: its claws raked four ways, one at random
    // each time, its spring (the special "pounce", as weapons.js names it) a leap with its wings
    // spread; its other idle as it rests; walking at 1.1 m/s, its run a sprint played slower at its
    // chase; in one of its three skins (its own red, pale, ash) by its seed)
    fiend: Object.freeze({
        asset: "beast-fiend",
        skins: Object.freeze(["", "pale", "ash"]),
        length: 1.26,
        made: Object.freeze({ long: 1.11, tall: 2.12 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", run: "Run", react: "Hit", dead: "Death" }),
        attacks: Object.freeze({ claw: "Attack", rake: "Attack 3", slash: "Attack 5", smash: "Attack 2" }),
        specials: Object.freeze({ pounce: "Attack 4" }),
        rests: Object.freeze({ look: "Idle 2" }),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "head", left: "hand_l" }),
        mouth: null,
        pace: 1.1,
        runPace: 5.65,
        flinch: 0.6,
    }),
    // (A hell's flayed (creatures.js), each one of Monster1's six builds, drawn from a man's height
    // to a head taller, made 2.1 metres tall (2.4 crowned); its own clips: its claws or its staff
    // swept, its lunge (a thrust cut from its second attack, "lunge" as weapons.js names it), and,
    // one with a staff, its free hand thrown up and out as it casts, curses, wails, drains or calls;
    // its other idle as it rests; walking at 1.36 m/s as it's made, running at 3.43)
    flayling: flayed("beast-flayling", { long: 0.39, tall: 2.08 }, 0.89, { rake: "Attack" }, { lunge: "Lunge" }),
    cinderHusk: flayed("beast-cinder-husk", { long: 0.39, tall: 2.08 }, 0.96, { grasp: "Attack", lunge: "Lunge" }, {}),
    pyreAcolyte: flayed("beast-pyre-acolyte", { long: 0.52, tall: 2.08 }, 0.94, { sweep: "Attack" }, { lunge: "Lunge", cast: "Cast" }),
    ossuaryPriest: flayed("beast-ossuary-priest", { long: 0.52, tall: 2.37 }, 1, { sweep: "Attack" }, { lunge: "Lunge", curse: "Cast", call: "Cast" }),
    dirgeWarden: flayed("beast-dirge-warden", { long: 0.5, tall: 2.37 }, 1.1, { sweep: "Attack" }, { lunge: "Lunge", wail: "Cast" }),
    flayedHierarch: flayed("beast-flayed-hierarch", { long: 0.67, tall: 2.37 }, 1.15, { sweep: "Attack" }, { lunge: "Lunge", drain: "Cast" }),
    // (A hell's gorgers (creatures.js), each from one of Monster2's four builds: made 1.9 metres
    // tall (2.5 under the warlord's banners), drawn a tenth to a third again as tall; its own
    // clips: its club swung or its claws, and its maw's bite, its spew and its roar (made from its
    // idle; the roar its call), roaring as it rests; walking at 1.53 m/s as it's made, with no run
    // of its own (its walk played faster). It has no head: its maw's in its belly)
    slagGorger: gorger("beast-slag-gorger", { long: 0.7, tall: 1.87 }, 1.1, { claw: "Attack" }),
    forgeBrute: gorger("beast-forge-brute", { long: 1.03, tall: 1.87 }, 1.2, { smash: "Attack" }),
    chainedGlutton: gorger("beast-chained-glutton", { long: 1.18, tall: 1.9 }, 1.3, { smash: "Attack" }),
    bloatGorger: gorger("beast-bloat-gorger", { long: 0.7, tall: 1.87 }, 1.15, { claw: "Attack" }),
    pitRavager: gorger("beast-pit-ravager", { long: 1.03, tall: 1.87 }, 1.1, { rend: "Attack" }),
    gorgerWarlord: gorger("beast-gorger-warlord", { long: 1.18, tall: 2.5 }, 1.35, { smash: "Attack" }),
    // (The Lord of the Pit's henchmen (creatures.js): Monster3 ("Villain's Henchman"), made 1.8
    // metres tall, drawn 1.9; its own clips: its claws (one way), its flinch, its fall; walking at
    // 1.69 m/s. No run (its pack's demo has one, retargeted from Unreal's template: Epic's, for
    // Unreal Engine only): it walks, as a gorger does, its walk up to twice its pace. In one of
    // its four skins by its seed (its own rust, bone, blood with its eyes burning, bile))
    henchman: Object.freeze({
        asset: "beast-henchman",
        skins: Object.freeze(["", "bone", "blood", "bile"]),
        length: 0.99,
        made: Object.freeze({ long: 0.94, tall: 1.8 }),
        clips: Object.freeze({ idle: "Idle", walk: "Walk", react: "Hit", dead: "Death" }),
        attacks: Object.freeze({ rend: "Attack" }),
        specials: Object.freeze({}),
        rests: Object.freeze({}),
        fire: Object.freeze({}),
        joints: Object.freeze({ torso: "spine_03", body: "pelvis", head: "head", mouth: "head", left: "hand_l" }),
        mouth: null,
        pace: 1.69,
        runPace: null,
        flinch: 0.6,
    }),
    // (A hell's walkers (creatures.js), one kind on each level, each in its level's skins: brimstone
    // in the Breach, ash in the Halls of Bone, their own or charred in the River of Fire (where
    // they're at home, met the most), bile in the Pit)
    brimstoneWalker: walker(["brimstone"]),
    ashWalker: walker(["ash"]),
    hellwalker: walker(["", "char"]),
    bileWalker: walker(["bile"]),
    // (The orcs on a dungeon's throne (creatures.js), each in a dressing of the Orc's: the Orc
    // Warlord on a cave's, brown-skinned and red-eyed, in trousers, boots, belt and bracers, drawn
    // 2.08 metres tall; the Orc Reaver at the head of an outlaws' hideout, red-skinned and
    // yellow-eyed, bare-legged and barefoot in his loincloth, drawn 1.99)
    orcWarlord: orc("beast-orc-warlord", 1.15),
    orcReaver: orc("beast-orc-reaver", 1.1),
    // (Its finest dressing, armoured from his shoulder to his knees: the Orc King, his rare card's
    // foe (core/rare.js), green-skinned, drawn 2.17 metres tall (and bigger yet as the boss he is:
    // beasts/champions.js); and his champions in the brown skin (Ironjaw) and the red (Bloodtusk),
    // drawn 2.08: kingly)
    orcKing: kingly(1.2),
    orcIronjaw: kingly(1.15, ["brown"]),
    orcBloodtusk: kingly(1.15, ["red"]),
});

// The models read and those asked for, by kind (each in its skins); and each model file's read,
// by the catalog's entry, and those still being fetched: one read for every kind drawn from it (a
// werewolf, its den's Moonfang)
const read = new Map();
const asked = new Map();
const files = new Map();
const fetching = new Set();

// How long (milliseconds) before a model that couldn't be read (offline, say) is asked for again
const RETRY = 60000;

/** How many times a second a clip one kind borrows from another's model is sampled (borrowClips). */
export const BORROW_RATE = 30;

/**
 * The clips a kind borrows from another kind's model (MODELS' `borrows`: { from, clips, bones,
 * carried }: the giant ant's fall and flinch, the Ant Monster's), made its own: each of `clips` in
 * the lender's model (`lender`: its glTF as read) played on the kind's own (`gltf`), each of its
 * bones (`bones`: its own by the lender's) turned in the world as the lender's turns from how it
 * stands idle (each's `clips.idle`, as it starts), the rest of them as they are standing idle; and
 * all of it carried as the lender's `carried` bone is ([its own, the lender's]), as much less far
 * as it's the shorter (`made.long`) across, and up and down as much less as its body stands the
 * lower. Sampled BORROW_RATE times a second. Neither model as read is changed: each is posed in a
 * copy of it.
 */
export function borrowClips(id, gltf, lender) {
    const model = MODELS[id];
    const { from, clips, bones, carried } = model.borrows;
    const [own, theirs] = [clone(gltf.scene), clone(lender.scene)];
    const named = (scene) => {
        const found = new Map();

        scene.traverse((node) => node.isBone && found.set(node.name, node));

        return found;
    };
    const [ours, others] = [named(own), named(theirs)];
    const order = [...ours.values()];
    const turnOf = (node) => node.getWorldQuaternion(new THREE.Quaternion());
    const placeOf = (node) => node.getWorldPosition(new THREE.Vector3());
    const mixer = new THREE.AnimationMixer(theirs);
    // (Standing idle, as it starts, till another clip's played: stopping it would put it back as
    // it's bound)
    const stand = (scene, mixing, animations, idle) => {
        const clip = animations.find(({ name }) => name === idle);

        if (clip) {
            mixing.clipAction(clip).play();
            mixing.update(0);
        }

        scene.updateMatrixWorld(true);
    };

    // (Each standing idle: how they're turned and where they stand from there; its own posed so
    // throughout, the lender till its clips are played)
    stand(own, new THREE.AnimationMixer(own), gltf.animations, model.clips.idle);
    stand(theirs, mixer, lender.animations, MODELS[from].clips.idle);

    // (Each of its bones lent the turns of one of the lender's, and where each stands idle)
    const lent = new Map(Object.entries(bones).filter(([mine, other]) => ours.has(mine) && others.has(other)).map(([mine, other]) => [ours.get(mine), others.get(other)]));
    const atRest = new Map([...order.map((bone) => [bone, turnOf(bone)]), ...[...lent.values()].map((bone) => [bone, turnOf(bone)])]);
    const [mine, other] = [ours.get(carried[0]), others.get(carried[1])];
    const body = [...lent].find(([, source]) => source === other)?.[0] ?? mine;
    const [from0, to0] = [placeOf(other), placeOf(mine)];
    const across = model.made.long / MODELS[from].made.long;
    const up = placeOf(body).y / Math.max(1e-3, from0.y);

    return clips
        .map((name) => lender.animations.find((clip) => clip.name === name))
        .filter(Boolean)
        .map((clip) => {
            const frames = Math.max(2, Math.ceil(clip.duration * BORROW_RATE) + 1);
            const times = new Float32Array(frames);
            const turns = new Map(order.map((bone) => [bone, new Float32Array(frames * 4)]));
            const places = new Float32Array(frames * 3);
            const action = mixer.clipAction(clip);
            const delta = new THREE.Quaternion();

            mixer.stopAllAction();
            action.play();

            for (let f = 0; f < frames; f++) {
                times[f] = (f / (frames - 1)) * clip.duration;
                action.time = Math.min(times[f], clip.duration - 1e-4);
                mixer.update(0);
                theirs.updateMatrixWorld(true);

                // (Each of its bones turned in the world as the lender's that it's lent, or as
                // it is at rest under its parent as turned; parents before their children)
                const world = new Map();

                for (const bone of order) {
                    const parent = world.get(bone.parent) ?? turnOf(bone.parent);
                    const source = lent.get(bone);
                    const turned = source ? delta.copy(turnOf(source)).multiply(atRest.get(source).clone().invert()).clone().multiply(atRest.get(bone)) : parent.clone().multiply(bone.quaternion);

                    world.set(bone, turned);
                    parent.clone().invert().multiply(turned).toArray(turns.get(bone), f * 4);
                }

                // (All of it carried as the lender is)
                const moved = placeOf(other).sub(from0);

                mine.parent.worldToLocal(new THREE.Vector3(to0.x + moved.x * across, to0.y + moved.y * up, to0.z + moved.z * across)).toArray(places, f * 3);
            }

            mixer.uncacheAction(clip);

            return new THREE.AnimationClip(clip.name, clip.duration, [...order.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, turns.get(bone))), new THREE.VectorKeyframeTrack(`${mine.name}.position`, times, places)]);
        });
}

// What fetches the catalog's files, once the game's said (fetchModelsWith); till then (a test, the
// labs) they're read straight from where they are
let fetcher = null;

/**
 * Fetch the models through the game's downloader (app/fetcher.js: in the background, out of the
 * way of play, kept once fetched, and only what's wanted now while saving data).
 */
export function fetchModelsWith(downloader) {
    fetcher = downloader;
}

// A model fetched (a Blob) read: not kept by the loader (readGltf), as it's let go of here
// (forgetModels)
async function readBlob(blob) {
    const url = URL.createObjectURL(blob);

    try {
        return await readGltf(url);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * A kind's skins (MODELS' `skins`, but its own), each read as its model is (the catalog's
 * "<asset>-skins", <name>.<skin>.bin), its materials ready to wear: put on the model as read
 * (`gltf.skins`: { skin: [material...] }), once for every kind drawn from it that wears it. One
 * that couldn't be read isn't worn: its own is.
 */
async function readSkins(id, gltf, { priority, page }) {
    const { asset, skins = [] } = MODELS[id];
    const found = ASSETS.models[`${asset}-skins`]?.files ?? [];

    gltf.skins ??= {};
    gltf.skinning ??= new Map();

    await Promise.all(
        skins.filter(Boolean).map((skin) => {
            if (!gltf.skinning.has(skin)) {
                const file = found.find(({ path }) => path.endsWith(`.${skin}.bin`));

                gltf.skinning.set(
                    skin,
                    (async () => {
                        try {
                            const worn = !file ? null : fetcher ? await fetcher.want(file, priority).then((blob) => blob && readBlob(blob)) : await readGltf(new URL(hashed(file.path, file.hash), page).href);

                            if (worn) {
                                gltf.skins[skin] = await worn.parser.getDependencies("material");
                            }
                        } catch (error) {
                            console.warn(`Couldn't read ${id}'s skin ${skin}`, error);
                        }
                    })(),
                );
            }

            return gltf.skinning.get(skin);
        }),
    );

    return gltf;
}

// A model file read (the catalog's entry `asset`), once for every kind drawn from it, as wanted as
// `priority`: a promise of it, or of null if it wasn't fetched (while saving data: asked for
// again, it may be); it's asked for again a while after it couldn't be read (RETRY)
function readFile(asset, priority, page) {
    const file = ASSETS.models[asset].files[0];

    // (Wanted sooner than it was: fetched sooner)
    if (files.has(asset)) {
        if (fetching.has(asset)) {
            fetcher.want(file, priority);
        }

        return files.get(asset);
    }

    let reading;

    if (fetcher) {
        fetching.add(asset);
        reading = fetcher.want(file, priority).finally(() => fetching.delete(asset)).then((blob) => blob && readBlob(blob));
    } else {
        reading = readGltf(new URL(hashed(file.path, file.hash), page).href);
    }

    files.set(
        asset,
        reading.then(
            (gltf) => {
                if (!gltf) {
                    files.delete(asset);
                }

                return gltf;
            },
            (error) => {
                setTimeout(() => files.delete(asset), RETRY);

                throw error;
            },
        ),
    );

    return files.get(asset);
}

// The clips each kind that borrows them (MODELS' `borrows`: the giant ant) has from another's model,
// once both are read: put on its model as read, once (borrowClips), for each drawn from it from then
// on; one that couldn't be made its own, none
function lend() {
    for (const [id, { borrows }] of Object.entries(MODELS)) {
        const [gltf, lender] = [read.get(id), borrows && read.get(borrows.from)];

        if (gltf && lender && !gltf.borrowed) {
            gltf.borrowed = true;

            try {
                gltf.animations.push(...borrowClips(id, gltf, lender));
            } catch (error) {
                console.warn(`Couldn't lend ${id} ${borrows.from}'s clips`, error);
            }
        }
    }
}

/** Whether a kind's drawn from a model (MODELS) that the catalog has. */
export function hasModel(id) {
    return Boolean(MODELS[id] && ASSETS.models[MODELS[id].asset]?.files?.length);
}

/** A kind's model, if it's been read ({ scene, animations }); or null (its stand-in's drawn). */
export function modelOf(id) {
    return read.get(id) ?? null;
}

/**
 * Ask for a kind's model to be read, once, as wanted as `priority` (the downloader's: "now" for
 * one coming into the battle, "soon" for one near; while saving data, only "now" is fetched): a
 * promise of it, or null if it isn't to be had (yet: asked for again it may be; one that couldn't
 * be read, a while after: RETRY); or null if it has none, or there's no page to read it from (a
 * test).
 */
export function wantModel(id, priority = "soon") {
    const page = globalThis.document?.baseURI ?? globalThis.location?.href;

    if (!hasModel(id) || !page) {
        return null;
    }

    // (Its file read, or being read, for another kind drawn from it: wanted sooner, if it is)
    const reading = readFile(MODELS[id].asset, priority, page);

    if (asked.has(id)) {
        return asked.get(id);
    }

    // (Its skins with it: one of them may wear any)
    asked.set(
        id,
        reading.then((gltf) => gltf && readSkins(id, gltf, { priority, page })).then(
            (gltf) => {
                if (gltf) {
                    read.set(id, gltf);
                    lend();

                    // (None drawn from it yet: let go of in time if none is, as one none's
                    // drawn from any more)
                    if (!holders.has(MODELS[id].asset)) {
                        unheld.set(MODELS[id].asset, performance.now());
                    }
                } else {
                    // (Not fetched, while saving data: asked for again when it's wanted now)
                    asked.delete(id);
                }

                return gltf;
            },
            (error) => {
                // (Its stand-in drawn meanwhile)
                setTimeout(() => asked.delete(id), RETRY);
                console.warn(`Couldn't read ${id}'s model`, error);

                return null;
            },
        ),
    );

    return asked.get(id);
}

// A kind's files: its model's, and the skins it wears (MODELS' `skins`)
function filesOf(id) {
    const { asset, skins = [] } = MODELS[id];
    const worn = (ASSETS.models[`${asset}-skins`]?.files ?? []).filter(({ path }) => skins.some((skin) => skin && path.endsWith(`.${skin}.bin`)));

    return [ASSETS.models[asset].files[0], ...worn];
}

/**
 * Have a kind's model fetched and kept (its file and the skins it wears), but not read: so it's
 * read at once, not downloaded, when it's wanted (wantModel), and isn't held in memory meanwhile.
 * As wanted as `priority` (the downloader's), `hurry` if the player's waiting for it. Resolves
 * with whether all of it's kept; without the game's downloader (a test, the labs), false.
 */
export async function fetchModel(id, priority = "soon", { hurry = false } = {}) {
    if (!fetcher || !hasModel(id)) {
        return false;
    }

    return (await Promise.all(filesOf(id).map((file) => fetcher.keep(file, priority, { hurry })))).every(Boolean);
}

/**
 * Get kinds' models ready for a player waiting to meet them (at the door of the place they're in:
 * app/readying.js): fetched first, hurried, then read. Returns { kinds (those drawn from a model
 * the catalog has), files ({ path, bytes }: each once, the model files and skins between them),
 * progress() ({ received, bytes, read: the kinds read, failed: the files that couldn't be had }),
 * ready (a promise: resolved once each kind's read, or couldn't be: its stand-in's drawn then),
 * calm() (the player's stopped waiting: no longer hurried) }.
 */
export function readyModels(kinds) {
    const wanted = [...new Set(kinds)].filter(hasModel);
    const files = [...new Map(wanted.flatMap(filesOf).map((file) => [file.path, file])).values()];
    const done = new Map();
    const ready = Promise.all(
        wanted.map(async (id) => {
            if (fetcher) {
                await Promise.all(filesOf(id).map(async (file) => done.set(file.path, await fetcher.keep(file, "now", { hurry: true }))));
            }

            await wantModel(id, "now");
        }),
    ).then(() => {});

    return {
        kinds: wanted,
        files: files.map(({ path, bytes }) => ({ path, bytes })),
        progress: () => ({
            received: files.reduce((sum, file) => sum + (done.has(file.path) ? file.bytes : Math.min(file.bytes, fetcher?.received(file) ?? 0)), 0),
            bytes: files.reduce((sum, { bytes }) => sum + bytes, 0),
            read: wanted.filter((id) => read.has(id)),
            failed: files.filter(({ path }) => done.get(path) === false).map(({ path }) => path),
        }),
        ready,
        calm: () => files.forEach((file) => fetcher?.calm(file)),
    };
}

/**
 * The kinds drawn from a model that a place gone into holds (a building, or a site with a way in:
 * core/insides.js), to have them read before the player meets them: a dungeon's foes, once it's
 * made (insides.js dungeonRooms), else all its theme may put in it (its packs, its mini-bosses,
 * its bosses and their guards). Others hold none yet. A pure function.
 */
export function modelsInside(building) {
    if (building?.kind !== "dungeon") {
        return [];
    }

    const theme = THEMES[building.theme ?? "caves"];
    const creatures = building.dungeon
        ? building.dungeon.levels.flatMap(({ packs }) => packs.flatMap(({ foes }) => foes.map(({ creature }) => creature)))
        : theme
          ? [...theme.packs.flatMap(({ creatures: kinds }) => kinds), ...theme.minis.map(({ creature }) => creature), ...theme.bosses.flatMap(({ creature, guard = [] }) => [creature, ...guard])]
          : [];

    return [...new Set(creatures)].filter(hasModel);
}

/** Lets a model be used as read (a test's, or the labs'), as if wantModel had read it. */
export function useModel(id, gltf) {
    read.set(id, gltf);
}

// The textures a skin's material may give in place of its model's own, as three.js names them
const MAPS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"];

// How many are drawn from each model file (by the catalog's entry: BeastAvatar's), and since when
// none has been (performance.now()'s), each kept that long for another to be drawn from it at once
// before it's let go (forgetModels)
const holders = new Map();
const unheld = new Map();

/**
 * How long a model none is drawn from is kept (ms), for another to be drawn from it at once: a
 * kind met lately is likely met again, and one that isn't costs its model's reading again if it is
 * (not its fetching: the downloader keeps what it's fetched, app/fetcher.js).
 */
export const MODEL_LINGER = 3 * 60 * 1000;

/**
 * How long the models of a place's creatures are kept once the player's left it (ms), none drawn
 * from them (forgetModels' `area`): long enough to step straight back in, not so long they're
 * carried off into the world, where they aren't met.
 */
export const AREA_LINGER = 30 * 1000;

// When each model wanted for a place the player's in, or at the door of, was last wanted (by the
// catalog's entry: forgetModels' `area`), those wanted out in the world (`wanted`) not among them
const areaWanted = new Map();

/** One more drawn from a kind's model. */
export function holdModel(id) {
    const { asset } = MODELS[id];

    holders.set(asset, (holders.get(asset) ?? 0) + 1);
    unheld.delete(asset);
}

/** One fewer drawn from a kind's model (at `now`): none left, it's let go MODEL_LINGER after (forgetModels). */
export function releaseModel(id, now = performance.now()) {
    const { asset } = MODELS[id];
    const left = (holders.get(asset) ?? 0) - 1;

    if (left > 0) {
        holders.set(asset, left);

        return;
    }

    holders.delete(asset);
    unheld.set(asset, now);
}

// A model as read let go of off the graphics card: its meshes' shapes, and its materials and their
// pictures, its skins' too (those drawn from it have their own copies of its materials, let go of
// with them: beast.js dispose)
function disposeModel(gltf) {
    const materials = new Set(Object.values(gltf.skins ?? {}).flat());

    gltf.scene.traverse((node) => {
        node.geometry?.dispose();

        for (const material of [node.material ?? []].flat()) {
            materials.add(material);
        }
    });

    for (const material of materials) {
        for (const value of Object.values(material)) {
            if (value?.isTexture) {
                value.dispose();
            }
        }

        material.dispose();
    }
}

/**
 * Let go of the models none has been drawn from for `linger` ms (at `now`), but those of the kinds
 * still `wanted` (near the player's lairs: modelsNear), and those still being read: out of what's
 * read (modelOf null again: its stand-in drawn, till it's wanted and read again), and off the
 * graphics card. Those of the kinds wanted for the place the player's in, or at the door of
 * (`area`: modelsInside), are kept while they are, and let go of AREA_LINGER after they last were
 * (none drawn from them), unless they're wanted out in the world too. Returns how many were let go.
 */
export function forgetModels(now = performance.now(), linger = MODEL_LINGER, wanted = [], area = []) {
    let gone = 0;

    for (const id of area) {
        if (MODELS[id]) {
            areaWanted.set(MODELS[id].asset, now);
        }
    }

    for (const id of wanted) {
        areaWanted.delete(MODELS[id]?.asset);
    }

    for (const [asset, unheldAt] of unheld) {
        const kinds = Object.keys(MODELS).filter((id) => MODELS[id].asset === asset);
        const gltf = kinds.map((id) => read.get(id)).find(Boolean);
        const placed = areaWanted.has(asset);
        const since = placed ? Math.max(unheldAt, areaWanted.get(asset)) : unheldAt;

        if (now - since < (placed ? AREA_LINGER : linger) || kinds.some((id) => wanted.includes(id) || area.includes(id) || (asked.has(id) && !read.has(id)))) {
            continue;
        }

        unheld.delete(asset);
        areaWanted.delete(asset);
        files.delete(asset);

        for (const id of kinds) {
            read.delete(id);
            asked.delete(id);
        }

        if (gltf) {
            disposeModel(gltf);
            gone++;
        }
    }

    return gone;
}

/** What's kept: how many models are read, and how many of them none's drawn from now. */
export function keptModels() {
    const assets = new Set([...read.keys()].map((id) => MODELS[id]?.asset ?? id));

    return { models: assets.size, unheld: [...unheld.keys()].filter((asset) => assets.has(asset)).length };
}

/**
 * Which kinds' models to ask for (wantModel), by where the player is (`at`: [x, z], metres) and
 * the great lairs (`lairs`: [{ at, beast }], as game.js #lairsAloft lists them, slain or not):
 * those whose lair's within `within` metres. A pure function: the game asks every so often.
 */
export function modelsNear(at, lairs, within = 1500) {
    return [...new Set(lairs.filter((lair) => MODELS[lair.beast] && Math.hypot(lair.at[0] - at[0], lair.at[1] - at[1]) < within).map(({ beast }) => beast))];
}

/**
 * Which kinds' models to ask for by what may be met where the player is (`at`: [x, z] metres, out
 * in the world; `home`: where their people start, the wild's tamest near it; `dark`: whether the
 * night's out): those drawn from a model that may be put out there, at that hour (creatures.js
 * candidatesAt: a werewolf, in the woods far from home by night), so one's read before it comes,
 * not drawn as its stand-in. A pure function: the game asks every so often.
 */
export function modelsMet(plan, at, home, dark) {
    const land = landAt(plan, ...at);

    return candidatesAt(land, tierAt(at, [home], land.biome), dark)
        .filter(({ id }) => MODELS[id])
        .map(({ id }) => id);
}

const smoothstep = (u) => {
    const v = Math.min(1, Math.max(0, u));

    return v * v * (3 - 2 * v);
};

/** The clip an attack's way (`style`) plays: up in the air (`aloft`), its way there's, if it has one. */
export function clipOf(model, style, aloft = false) {
    return (aloft && model.aloft?.[style]) || model.attacks[style] || model.specials[style] || null;
}

// How fast its walk and its run play for how fast it goes (metres a second, as it's drawn): its
// walk's pace and its run's, played at their own rate; slower or faster in step, down to half as
// fast and up to twice
const strideRates = (model, speed) => ({
    walk: Math.max(0.5, Math.min(2, speed / model.pace)),
    run: model.runPace ? Math.max(0.5, Math.min(2, speed / model.runPace)) : 1,
});

/**
 * How far into its walk and its run (seconds of each clip) a body is once it's gone on `dt`
 * seconds at `speed` from where it was (`strides`: { walk, run }): each played on at the rate for
 * how fast it's going now (strideRates). So one setting off, speeding up or slowing down goes on
 * through its stride from where it was; its clock times the rate (poseOf with no `strides`) would
 * leap it along its stride, the further the longer it's been about, flickering through its walk
 * while it gets up to speed. A pure function.
 */
export function strideOn(model, strides, speed, dt) {
    const rates = strideRates(model, speed);

    return { walk: strides.walk + rates.walk * dt, run: strides.run + rates.run * dt };
}

/**
 * How a model's clips are posed for what the game asks of a body (BeastAvatar's plan.pose: its
 * `speed`, `attack`, `rest`, `react`, `dead`, `fly` (hanging in the air, `hover`: its hover clip);
 * `hang`, one that lurks hanging from its thread (its `lurk`), its middle `height` metres up as it's
 * drawn, still, or dropping (`u`, 0 to 1 of the way); `t`, the beast's own clock, seconds;
 * `strides`, how far into its walk and its run it is (strideOn; none, its clock at the rate for its
 * speed)): each clip (by name) with its weight (all of them adding up to 1) and how far in it is
 * (seconds). `lengths`: each clip's length (seconds); `died`: how long it's been dead (seconds: its
 * fall plays at its own pace, longer than the game's). A pure function.
 */
export function poseOf(model, { speed = 0, attack = null, rest = null, react = null, guard = null, dead = null, fly = null, hang = null, t = 0, strides = null }, { lengths, died = 0 }) {
    const { clips } = model;
    // (A clip it has: one it borrows only once it's been lent it, borrowClips)
    const has = (clip) => Boolean(clip) && lengths[clip] !== undefined;
    const at = (clip, seconds) => {
        const length = lengths[clip] || 1;

        return Math.min(length - 1e-4, Math.max(0, seconds));
    };
    const loop = (clip, seconds) => {
        const length = lengths[clip] || 1;

        return ((seconds % length) + length) % length;
    };

    // (Dead: its fall, held at its end; one with none of its own, standing still as it rolls over:
    // fallOf)
    if (dead) {
        return has(clips.dead) ? [{ clip: clips.dead, weight: 1, time: at(clips.dead, died) }] : [{ clip: clips.idle, weight: 1, time: 0 }];
    }

    // (Lurking, hanging from its thread as high as it's told (its lurk's clip held from where it's
    // hanging that high: its middle `top` metres up as it's made at its start, sliding down `fall`
    // a second); dropping on it, played from there to its end, touching the ground and onto its feet)
    if (hang && model.lurk && has(model.lurk.clip)) {
        const { clip, top, fall, lands, end } = model.lurk;
        const from = Math.min(lands - 0.3, Math.max(0, (top - (hang.height * model.made.long) / model.length) / fall));

        return [{ clip, weight: 1, time: at(clip, hang.u === null ? from : from + Math.min(1, hang.u) * (end - from)) }];
    }

    // On the ground: standing, or walking as fast as it goes (its walk's pace); one that has a run
    // running from a fifth again its walk's pace, all of it at twice, as fast as it goes (its
    // run's pace)
    const walking = smoothstep(speed / (model.pace * 0.35));
    const running = clips.run ? smoothstep((speed - model.pace * 1.2) / (model.pace * 0.8)) : 0;
    const rates = strideRates(model, speed);
    const stride = strides ?? { walk: t * rates.walk, run: t * rates.run };
    let posed = [
        { clip: clips.idle, weight: 1 - walking, time: loop(clips.idle, t) },
        { clip: clips.walk, weight: walking * (1 - running), time: loop(clips.walk, stride.walk) },
    ];

    if (running > 0) {
        posed.push({ clip: clips.run, weight: walking * running, time: loop(clips.run, stride.run) });
    }
    const over = (clip, weight, time) => {
        posed = posed.map((one) => ({ ...one, weight: one.weight * (1 - weight) })).concat([{ clip, weight, time }]);
    };

    // In the air: beating its wings or gliding, as hard as it beats them; or hanging there
    const hovering = Boolean(fly?.hover && clips.hover);

    if (fly?.amount > 0) {
        const beat = Math.min(1, Math.max(0, fly.beat ?? 0.5));
        const beating = { clip: clips.fly, weight: fly.amount * beat, time: loop(clips.fly, t) };
        const gliding = { clip: clips.glide, weight: fly.amount * (1 - beat), time: loop(clips.glide, t) };
        const hanging = { clip: clips.hover, weight: fly.amount, time: loop(clips.hover, t) };

        posed = posed.map((one) => ({ ...one, weight: one.weight * (1 - fly.amount) })).concat(hovering ? [hanging] : [beating, gliding]);
    }

    // Resting its way (a roar), eased in and out
    if (rest && model.rests[rest.name]) {
        over(model.rests[rest.name], rest.w, loop(model.rests[rest.name], rest.t));
    }

    // On guard (its model's `guard`: { w, t, struck }): its guard held up, eased in and out, and
    // bracing behind it from the start of its `struck` as a blow's caught on it, eased in and out
    if (guard && model.guard && has(model.guard.hold)) {
        over(model.guard.hold, guard.w, loop(model.guard.hold, guard.t));

        const length = lengths[model.guard.struck] ?? 0;

        if (guard.struck !== null && has(model.guard.struck) && guard.struck < length) {
            const u = guard.struck / length;

            over(model.guard.struck, guard.w * smoothstep(Math.min(1, u / 0.15, (1 - u) / 0.15)), at(model.guard.struck, guard.struck));
        }
    }

    // Attacking: the clip for its way, through to its end (or as much of it as its `spans` says),
    // eased in and out at either end; a chain of clips (`chains`), each link played in its turn,
    // eased into the next over CHAIN_EASE seconds about where they meet
    const chain = attack && !hovering ? (model.chains?.[attack.style] ?? null) : null;
    const way = attack && !chain && clipOf(model, attack.style, hovering);

    if (chain) {
        const u = Math.min(1, Math.max(0, attack.u));
        const weight = smoothstep(Math.min(u / 0.06, (1 - u) / 0.06));
        const links = chainAt(chain, u);

        posed = posed.map((one) => ({ ...one, weight: one.weight * (1 - weight) })).concat(links.map(({ clip, share, time }) => ({ clip, weight: weight * share, time: at(clip, time) })));
    } else if (way) {
        const u = Math.min(1, Math.max(0, attack.u));

        over(way, smoothstep(Math.min(u / 0.06, (1 - u) / 0.06)), at(way, attackTime(model, attack.style, way, u, lengths)));
    }

    // Struck: the start of its flinch, eased in and out (none, if it has none)
    if (react && has(clips.react)) {
        const u = Math.min(1, Math.max(0, react.u));

        over(clips.react, Math.sin(Math.PI * u) * 0.85, at(clips.react, u * model.flinch));
    }

    return posed.filter(({ weight }) => weight > 1e-4);
}

// How long (seconds) one link of a chain of clips (MODELS `chains`) is eased into the next, about
// where they meet
const CHAIN_EASE = 0.24;

/**
 * Where a chain of clips (MODELS `chains`: [{ clip, from, to }]) is, `u` of the way through it (0
 * to 1): [{ clip, share, time }], the link it's in (and, within CHAIN_EASE / 2 of where it meets
 * the next or the last, that one too, eased from one to the other), each its share of the pose
 * and how far into its clip (seconds). A pure function.
 */
export function chainAt(chain, u) {
    const total = chain.reduce((sum, { from, to }) => sum + (to - from), 0);
    const s = Math.min(1, Math.max(0, u)) * total;
    let start = 0;

    for (let k = 0; k < chain.length; k++) {
        const { clip, from, to } = chain[k];
        const end = start + (to - from);

        if (s <= end || k === chain.length - 1) {
            const next = chain[k + 1];
            const last = chain[k - 1];

            if (next && s > end - CHAIN_EASE / 2) {
                const share = smoothstep((s - (end - CHAIN_EASE / 2)) / CHAIN_EASE);

                return [
                    { clip, share: 1 - share, time: from + (s - start) },
                    { clip: next.clip, share, time: next.from + (s - end) },
                ];
            }

            if (last && s < start + CHAIN_EASE / 2) {
                const share = smoothstep((s - (start - CHAIN_EASE / 2)) / CHAIN_EASE);

                return [
                    { clip: last.clip, share: 1 - share, time: last.to + (s - start) },
                    { clip, share, time: from + (s - start) },
                ];
            }

            return [{ clip, share: 1, time: from + (s - start) }];
        }

        start = end;
    }

    return [];
}

/**
 * Whether what a model carries through a way of its own (MODELS `carry`) is in its hand at this
 * moment of an attack (BeastAvatar's attack: { style, u }): its carry's, or null.
 */
export function carriedAt(model, attack) {
    const carry = attack && model.carry?.[attack.style];

    return carry && attack.u >= carry.from && attack.u <= carry.to ? carry : null;
}

// How far into its clip (seconds) an attack its way (`style`, its clip `clip`) is, `u` of the way
// through it (0 to 1): through the whole of the clip, or as much of it as its `spans` says
function attackTime(model, style, clip, u, lengths) {
    const [from, to] = model.spans?.[style] ?? [0, lengths[clip] || 1];

    return from + u * (to - from);
}

// The beam a kind breathes (beasts/beam.js BEAMS: its catalog entry's), if it breathes one
const beamOf = (model) => (model.beam === false ? null : (BEAMS[model.asset] ?? null));

/**
 * Where a model's beam (beasts/beam.js BEAMS: its catalog entry's, if it breathes one) is in its
 * clip at this moment of an attack (BeastAvatar's attack: { style, u }): { clip, time } in its
 * breath's clip, or null (none drawn).
 */
export function beamAt(model, attack, lengths) {
    const beam = beamOf(model);
    const clip = attack && clipOf(model, attack.style);

    if (!beam || clip !== beam.clip) {
        return null;
    }

    return { clip, time: attackTime(model, attack.style, clip, Math.min(1, Math.max(0, attack.u)), lengths) };
}

/**
 * How one without a fall (`clips.dead`, among the clips it has: `lengths`; a giant ant's, borrowed,
 * before it's been lent it) falls dead (`dead`: BeastAvatar's { u, side }): rolled over onto its
 * back about its length, to the side it fell (`roll`, radians), and lifted as it goes over by as
 * much of its height (`lift`, 0 to 1) that it lies on its back on the ground, not under it; one
 * with a fall, none of that. A pure function.
 */
export function fallOf(model, dead, lengths) {
    if (!dead || lengths[model.clips.dead] !== undefined) {
        return { roll: 0, lift: 0 };
    }

    const turned = smoothstep(dead.u) * Math.PI;

    return { roll: turned * (dead.side ?? 1), lift: (1 - Math.cos(turned)) / 2 };
}

/**
 * Whether a breath's fire is out at this moment of an attack (BeastAvatar's attack: { style, u }),
 * and so how far through its clip (`lengths`: each clip's length, seconds; `aloft`: hanging in
 * the air, its clip there's).
 */
export function breathing(model, attack, lengths, aloft = false) {
    const clip = attack && clipOf(model, attack.style, aloft);
    const window = clip && model.fire[clip];

    if (!window) {
        return false;
    }

    const seconds = attackTime(model, attack.style, clip, attack.u, lengths);

    return seconds >= window[0] && seconds <= window[1];
}

/**
 * A body (BeastAvatar's plan) made from a kind's model as read (`gltf`), at the size BeastAvatar
 * scales it by (`scale`: drawn at MODELS' `length` all the same), in one of its skins (`skin`: ""
 * its own, or one of MODELS' `skins`, as wantModel read it; its own if that wasn't). `groundAt(x,
 * z)`: the ground's height, for its fire to spread along.
 */
export function modelBody(id, gltf, { scale = 1, groundAt = () => 0, skin = "" } = {}) {
    const model = MODELS[id];
    const scene = clone(gltf.scene);
    const inner = new THREE.Group();
    const size = model.length / model.made.long / scale;
    const levels = [];
    const materials = new Map();
    const drawn = new Map();
    const worn = (skin && gltf.skins?.[skin]) || [];

    inner.scale.setScalar(size);
    inner.add(scene);
    // (Made standing above where it is: sunk to the ground)
    scene.position.y = -(model.sink ?? 0);

    // Its meshes, a level of detail at a time (the pipeline's packed lower details: extras.lod),
    // each level's those of all its parts (a werewolf's body and its two lengths of fur); each of
    // its materials its own (flushed red when it's struck), in the skin it wears: the skin's
    // textures in place of its own, the rest its own
    scene.traverse((node) => {
        if (!node.isSkinnedMesh) {
            return;
        }

        if (!materials.has(node.material.name)) {
            const own = node.material.clone();
            const given = worn.find((material) => material.name === own.name);

            for (const map of MAPS.filter((one) => given?.[one])) {
                own[map] = given[map];
            }

            // (A skin that glows where its model's own doesn't: its glow's colour and strength with
            // its map, its model's own black)
            if (given?.emissiveMap) {
                own.emissive.copy(given.emissive);
                own.emissiveIntensity = given.emissiveIntensity;
            }

            materials.set(node.material.name, own);
        }

        node.material = materials.get(node.material.name);
        drawn.set(node, node.material);
        (levels[node.userData.lod ?? 0] ??= []).push(node);
        node.castShadow = false;
        node.receiveShadow = true;
    });

    // (Its beam, if it breathes one (beasts/beam.js BEAMS): its glow made to charge, in copies of
    // its materials that can, those drawn and flushed in their place)
    const beam = beamOf(model) ? new EnergyBreath(scene, beamOf(model), { groundAt }) : null;

    if (beam) {
        scene.traverse((node) => {
            if (node.isSkinnedMesh) {
                materials.set(node.material.name, node.material);
                drawn.set(node, node.material);
            }
        });
    }

    // (Its shadow from its least detailed level only: there all the time, casting it; not its own
    // level shown, drawn leaving nothing on the screen. A layer of its own won't do: three.js casts
    // only what the camera that's drawing sees)
    const shadows = levels.at(-1);
    const unseen = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });

    for (const mesh of shadows) {
        mesh.castShadow = true;
    }

    const showLevel = (level) => {
        const shown = Math.min(level, levels.length - 1);

        levels.forEach((meshes, i) => {
            for (const mesh of meshes) {
                if (i === levels.length - 1) {
                    mesh.material = i === shown ? drawn.get(mesh) : unseen;
                } else {
                    mesh.visible = i === shown;
                }
            }
        });
    };

    showLevel(0);

    const mixer = new THREE.AnimationMixer(scene);
    const actions = new Map(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
    const lengths = Object.fromEntries(gltf.animations.map((clip) => [clip.name, clip.duration]));

    for (const action of actions.values()) {
        action.play();
        action.setEffectiveWeight(0);
    }

    // (One sphere round it however it moves, for all its levels to be culled by: worked out from
    // its least detailed one as it stands, its skin on (its positions are packed small, made full
    // size by its skin), made big enough for its wings spread wide)
    const idle = actions.get(model.clips.idle);

    idle.setEffectiveWeight(1);
    mixer.update(0);
    scene.updateMatrixWorld(true);

    const sphere = new THREE.Sphere();

    for (const mesh of shadows) {
        mesh.computeBoundingSphere();
        sphere.isEmpty() ? sphere.copy(mesh.boundingSphere) : sphere.union(mesh.boundingSphere);
    }

    idle.setEffectiveWeight(0);
    sphere.radius *= 1.8;

    for (const mesh of levels.flat()) {
        mesh.boundingSphere = sphere;
    }

    // (Its fire, if it breathes any: from its mouth's lips, `mouth`)
    const joints = Object.fromEntries(Object.entries(model.joints).map(([joint, bone]) => [joint, scene.getObjectByName(bone) ?? scene]));
    const lips = model.mouth ? Object.fromEntries(Object.entries(model.mouth).map(([part, bone]) => [part, scene.getObjectByName(bone)])) : null;
    const breath = lips ? new Breath({ groundAt }) : null;
    const object = new THREE.Group();
    const where = { upper: new THREE.Vector3(), lower: new THREE.Vector3(), hinge: new THREE.Vector3() };
    const [body, ...others] = materials.values();
    let died = 0;
    let stepped = 0;
    // (How far into its walk and its run it is, carried on as it goes: strideOn)
    let strides = null;

    object.add(inner);

    if (breath) {
        object.add(breath.object);
    }

    if (beam) {
        object.add(beam.object);
    }

    // (What it carries in a hand through a way of its own (`carry`: the Stone Golem's boulder), held
    // by its bone, as big as it's made whatever the bone's own scale; shown only while it's held:
    // carriedAt)
    const carries = Object.values(model.carry ?? {});
    const held = carries.length ? new THREE.Mesh(boulderGeometry(), boulderMaterial()) : null;

    if (held) {
        const { bone, radius, at } = carries[0];
        const hand = scene.getObjectByName(bone) ?? scene;
        const own = new THREE.Vector3();

        scene.updateMatrixWorld(true);
        hand.getWorldScale(own);
        held.scale.setScalar((radius * size) / own.x);
        held.position.set(...at.map((value) => (value * size) / own.x));
        held.visible = false;
        held.castShadow = true;
        hand.add(held);
    }

    return {
        object,
        height: model.made.tall * size,
        // (Nose to tail, as the bodies built in code say theirs: scaled up by BeastAvatar's scale)
        length: model.length / scale,
        // (Its first material its body's; any others, its fur's, tinted and flushed as it is)
        materials: { body, others },
        skin: worn.length ? skin : "",
        joints,
        attacks: [...Object.keys(model.attacks), ...Object.keys(model.specials), ...Object.keys(model.chains ?? {})],
        rests: Object.keys(model.rests),
        look: { attacks: Object.keys(model.attacks), specials: [...Object.keys(model.specials), ...Object.keys(model.chains ?? {})], rests: Object.keys(model.rests) },
        model: id,
        // (Hanging and dropping from its thread its own way, its lurk's clip: poseOf)
        lurks: Boolean(model.lurk),
        levels,
        showLevel,
        breath,
        beam,
        lengths,

        pose(inputs) {
            died = inputs.dead ? died + inputs.dt : 0;

            // (Its speed as it's drawn: BeastAvatar gives it as the body's own, scaled down; its
            // stride carried on from where it was, at the rate for that speed: strideOn)
            const speed = inputs.speed * scale;

            strides = strides ? strideOn(model, strides, speed, inputs.dt ?? 0) : { walk: inputs.t ?? 0, run: inputs.t ?? 0 };

            const posed = poseOf(model, { ...inputs, speed, strides }, { lengths, died });
            const on = new Set(posed.map(({ clip }) => clip));

            for (const [name, action] of actions) {
                if (!on.has(name)) {
                    action.setEffectiveWeight(0);
                }
            }

            for (const { clip, weight, time } of posed) {
                const action = actions.get(clip);

                if (action) {
                    action.setEffectiveWeight(weight);
                    action.time = time;
                }
            }

            mixer.update(0);

            // (What it carries, in its hand while it's held)
            if (held) {
                held.visible = !inputs.dead && Boolean(carriedAt(model, inputs.attack));
            }

            // (Its beam, breathing one: aimed, lit and drawn for where its breath's clip is, its
            // head and neck turned to aim it over what the clip has; none, else)
            if (beam) {
                const breathing = inputs.dead || inputs.seen === false ? null : beamAt(model, inputs.attack, lengths);

                beam.at(breathing?.clip ?? null, breathing?.time ?? 0);
            }

            // (Fallen dead with no fall of its own: rolled onto its back, fallOf)
            const fall = fallOf(model, inputs.dead, lengths);

            inner.rotation.z = fall.roll;
            inner.position.y = fall.lift * model.made.tall * size;

            // (Footfalls: one a stride as it walks)
            if (inputs.onStep && speed > 0.2) {
                stepped += speed * inputs.dt;

                if (stepped > model.pace * 0.6) {
                    stepped = 0;
                    inputs.onStep(0, inputs.speed);
                }
            }

            // Its fire, out of its mouth while it breathes (where its lips are now)
            const fire = Boolean(breath) && breathing(model, inputs.attack, lengths, Boolean(inputs.fly?.hover));

            if (fire) {
                object.updateWorldMatrix(true, true);
                lips.upper.getWorldPosition(where.upper);
                lips.lower.getWorldPosition(where.lower);
                lips.hinge.getWorldPosition(where.hinge);
            }

            breath?.step(inputs.seen === false && !fire ? 0 : inputs.dt, fire ? where : null);
        },

        // Where what it carries in its hand is in the world (a boulder: MODELS `carry`), while it's
        // held; else null
        carried(target = new THREE.Vector3()) {
            return held?.visible ? held.getWorldPosition(target) : null;
        },

        // One of its clips (by name: `lengths`' keys) alone, `time` seconds into it, as it was
        // made: the model viewer's, to watch each of them (not what the game asks of a body: pose)
        hold(clip, time) {
            for (const [name, action] of actions) {
                action.setEffectiveWeight(name === clip ? 1 : 0);
                action.time = name === clip ? time : action.time;
            }

            mixer.update(0);
        },

        dispose() {
            unseen.dispose();
            breath?.dispose();
            beam?.dispose();
            mixer.stopAllAction();
            mixer.uncacheRoot(scene);
        },
    };
}
