# Crowds of players: how other games draw them, and what's built so far

A companion to the [multiplayer scaling plan](multiplayer_scaling_plan.md), written 2026-11-11
with the first pieces of its Stage 5 ("Stage 5 lets other players into the crowd machinery that
already ships"). It holds three things the plan doesn't: the research on how games with crowds
of players draw them, with its sources; what this first piece built, with what was measured; and
how each part maps onto the plan's slices. The programme, its gates and the owner's decisions
are the plan's. Where the research's own staging differed (it put players' own baked figures
before shared ones, and plates last), the scaling plan wins.

## How other games draw a crowd of players

**Who's drawn in full.** No game publishes its whole order; the pieces below are confirmed.

- **Guild Wars 2** first had the server report only the nearest characters. Enemies went unseen,
  so in 2013 it reported everyone and drew each one of three ways: the full model, a fallback
  model per race and armour class, or a name plate alone. Two settings choose how many get a
  model and how many of those the full one [1][2]. "Nameplates still appear for all characters"
  [3]. The counts behind each setting are unpublished [2].
- **Final Fantasy XIV** has a display limit with an Automatic setting [4]. Patch 4.5: "higher
  priority being given to nearby objects" and "The display of party members is now prioritized
  in all areas" [5]. Battle effects are set separately for self, party and others: all, limited
  or none [6].
- **Second Life** draws the avatars nearest the camera in full, up to a number the user sets, and
  the rest as impostors; your own is always full [7]. An impostor is a cached sprite refreshed
  every 2 to 8 frames by screen area, the furthest quarter at most every 16 (2009) [8].
- **Black Desert:** hide other adventurers, a distance past which they aren't shown, others'
  effects off [9]. **World of Warcraft 11.2:** Spell Density thins party and raid members'
  effects, not your own [10].
- **The order.** Confirmed: self always [7], party first [5], then nearest [1][5][7]. Target,
  attackers, friends and guild are common practice, not confirmed. Not found: New World, Lost
  Ark, PlanetSide 2, EVE's client side, FFXIV's full order.

**Cheaper ways to draw one.**

- Unreal's Animation Budget Allocator holds animation to a fixed budget (1.0 ms by default), runs
  the nearest at full rate and the rest slower with interpolation, and ticks at most 4 off
  screen [11]. Epic advises 15 Hz or less for most characters at distance [12]. Its Animation
  Sharing plugin evaluates one pose per state for a crowd: "the difference between 100
  characters and 1000 characters results in a minimum increase" [13]. Unity can stop animating
  what isn't visible [14].
- Merged outfits: Unreal's Skeletal Mesh Merge takes 50 three-part characters from 150 draw calls
  to 50, at "a high initial performance cost" [15].
- Pellagos already has each of these (docs/GAME.md, *Characters in the world*, *Soldiers in
  their crowds*, *Standing in*) but two: a merged outfit for players, built here, and players in
  the crowds, the plan's `5-2`.

**In a browser.**

- three.js forum, an old laptop, a 900-triangle, 25-bone model: under 60 fps past 200 separately
  skinned meshes; 500 with the mixer every fourth frame; 1,000 sharing skeletons; 2,000
  instanced went from 10 to 144 fps [22].
- three-vat (three r186 or later): bone textures, 500 robots in 3 draws, no blending, no frame
  rates given [23]. Babylon's baked animations: no blending, no interpolation between frames
  [24]. `client/js/world/crowd.js` already does both.
- InstancedMesh2 offers per-instance skinning and a 3,000-instance demo with no figures [25]. A
  single-draw demo of 100,000 simple figures reports 240 fps on an unnamed desktop [26].
- No iPhone measurement was found.

**Behind the drawing** (the server's side, for the plan's Stages 3 and 4: not restated there).
Age of Empires' lockstep served 8 players and "can really only run as fast as the slowest
machine" [16]. Planetary Annihilation dropped lockstep for a server that sends each client
curves for what it can see, about 1 Mbit a player [17]. Factorio kept lockstep, moved to
client-server and reached about 400 with "server overload / lags / desyncs" [18]; past 200, one
client catching up sent about 400 actions in a tick and groups of players were dropped [19].
Unreal's Iris gives priority 1.0 within 10 m, 0.2 out to 50 m, 0.1 beyond, accumulating until
sent [20]. World of Warcraft: sharding splits a zone, layering a realm, phasing follows the
story [21].

## What's built, and the plan's slice it belongs to

| Built | Where | The plan's slice |
|---|---|---|
| Other players' garments one mesh with one picture; one by one for 5 s after a change; a way back for any one of them (`drawApart`) | app/game.js `#outfitting`, characters/character.js `merging` | **`5-5`**, done here; its two acceptance numbers as measured are below |
| One order of precedence, a pure module: the player; their party; whoever they're set on; attackers; the party's foes; whoever they're trading or talking with; then the biggest on the screen; other maps last | app/precedence.js | The "full-tier order" that **`5-2`**, **`5-4`** and **`5-6`** are to rank by. Used today by the four places that already rank (`#marshal`, `#rationing`, `#folkRoom`, `#thronging`) |
| Bars over heads placed in that order, one covered by those before it not shown; soldiers' bars only within 60 m | app/hud.js `Covering`, app/game.js `#barsOverHeads` | For today's DOM bars. **`5-3`**'s batched plates replace them for those outside the party; the order and the rule for which are shown carry over |

The order says one thing the plan's wording doesn't: whoever's fighting the party comes after
the player's own attackers and before whoever they're talking with.

## What was measured

Headless Chromium (software rendering), 1000 × 600, the start town of seed 1; the player and
seven others before them, each in gear of their own (the starting gear; the humans', elves' and
orcs' uniforms; a jerkin and travel cloak; plate; a gambeson and cloak).

**`5-5`'s acceptance: draw calls for 8 heroes fall by at least 35%.** Met in the frame's own
pass, not with the shadow maps counted.

| | One by one | All at once | Fall |
|---|---|---|---|
| The seven's meshes (skinned) | 105 (79) | 56 (30) | 47% (62%) |
| The frame's own draws, the eight heroes | 119 | 70 | **41%** |
| With the sun's shadow maps' draws, near the camera | 166 | 117 | 30% |
| With them, 24 to 36 m off | 207 | 158 | 24% |

A hero's garments cast no shadow of their own (the body's stands for them), so the 47 draws the
eight make into the shadow maps near the camera, and 88 far from it, are the same either way:
their bodies, hair and what they carry, once for each shadow map they fall in.

**`5-5`'s acceptance: picture difference within the existing 2%.** Met in full detail, by a
wide margin; at the lower levels of detail it's the levels' own difference, over 2% for plate.
The measure is the levels of detail's (docs/CHARACTERS.md, *Performance*): the share of the
figure's own pixels that change by more than 48 levels of 255. Each of the seven was pictured
alone, lit as on a fair day, one by one and then all at once in the same pose (put together in
place, the game stopped); the same picture taken twice differed in no pixel.

| Wearing | In full, 835 to 887 px tall | At the quarter level, 277 to 294 px tall | Full against the quarter, one by one (all at once) |
|---|---|---|---|
| The starting gear | 0.00% | 0.2% | 0.3% (0.1%) |
| A jerkin, gloves and travel cloak | 0.01% | 0.6% | 0.9% (0.2%) |
| A gambeson, bracers and cloak | 0.01% | 0.4% | 2.6% (2.2%) |
| The orcs' uniform (a breastplate) | 0.02% | 1.0% | 1.3% (0.8%) |
| The humans' uniform (mail under a surcoat) | 0.09% | 2.0% | 3.1% (2.0%) |
| The elves' uniform | 0.21% | 2.4% | 3.4% (2.6%) |
| Plate (mail, a breastplate, gauntlets, greaves, sabatons) | 0.06% | 3.2% | 5.9% (4.2%) |

In full, the one mesh is the meshes it wore, and the outfit's picture differs from the garments'
own only along their edges, a texel wide. Under 360 pixels tall a body's drawn with a quarter of
its garments' triangles, and there an outfit's lowered as one mesh (as every soldier's is) where
one by one each garment's lowered by itself: the two differ by their triangles, not their
pictures, and the one mesh is the nearer of the two to its own full detail in every outfit (the
last column). A first set of pictures, taken before the just-merged mesh's lower levels had come
from their worker, compared it in full with the garments at the quarter and put plate at 6%:
that was the levels of detail, not the merging.

**Memory.** Counted from the seven's own meshes, each picture once:

| The seven others | One by one | All at once |
|---|---|---|
| Pictures their garments are drawn with, 131 to 184 px tall | 33.3 MB | 18.7 MB |
| The same, 43 to 60 px tall | 33.3 MB | 4.7 MB |
| Held on the page by them | 45.8 MB | 34.8 MB near, 23.9 MB far |

A garment's own picture is shared by everyone who wears it; an outfit's is its wearers' alone.
Six of the seven's twenty garments are the player's own hero's too, and with the seven near
the camera the whole card held as much either way (282.1 MB against 281.9 MB). So a merged
outfit saves draws always, and pictures where its wearer's seen small (under 120 pixels: a
quarter the size) or wears what no one else does; a hundred near players in a hundred mixes of
the same garments would hold more in outfits than in garments. That bears on `5-2`: a player
past the full tier should be a figure, not a merged body.

**Time.** The seven's outfits were put together in 4.0 seconds of the game's time between them,
a step or more a frame. One step of an outfit's picture, the first, is long (it finds how far
inside every garment every corner of the body is, in one go), as it is for any guard built.

## What the owner decided

The plan fixes 100 players a world, and the setting "Other players in full: Automatic, 4, 8, 16,
All". Nothing of this stage's is still open.

Answered by the owner on 2026-11-11:

- **Plate stays drawn all at once.** In full, drawn all at once is within 0.2% of one by one.
  Under 360 pixels tall, at the quarter level of detail, plate differs by 3.2% and the humans'
  and elves' uniforms by 2.0 to 2.4%, because an outfit's lowered as one mesh, as the soldiers'
  are: over `5-5`'s 2%, and kept.
- **`5-5`'s 35% is counted in the frame's own pass** (41%: met), not with the shadow maps' draws
  (24 to 30%). A hero's garments cast no shadow of their own, so putting them together can't
  lessen those: about six draws a hero near the camera and eleven far, which the gate on
  players' draws (60 of a frame's 300) will have to deal with in its own slice.
- **Whoever's fighting the player's party keeps its place in the order,** after the player's
  own attackers and before whoever they're talking with: the scaling plan's wording has it now.
- **A hired adventurer's bar is never hidden,** as the party's aren't.
- **A bar's hidden once more than half of it lies under those before it:** half is right, not
  any overlap.
- **Parties only, for now:** no friends or guilds for the order to know of. Should they come,
  they're a standing of their own in `client/js/app/precedence.js`, after the party.

## Sources

All opened unless listed under "could not open".

1. ArenaNet, "World vs. World: the end of culling": https://www.guildwars2.com/en/news/world-vs-worldthe-end-of-culling/
2. Guild Wars 2 Wiki, Culling: https://wiki.guildwars2.com/wiki/Culling
3. Guild Wars 2 Wiki, Options: https://wiki.guildwars2.com/wiki/Options
4. FFXIV UI guide, Character and Object Quantity: https://na.finalfantasyxiv.com/uiguide/faq/faq-other/setting_ch_quantity.html
5. FFXIV Patch 4.5 notes: https://na.finalfantasyxiv.com/lodestone/topics/detail/97afed7c0efbbe8260755f948d0cf2b912d71121
6. FFXIV UI guide, battle effects: https://na.finalfantasyxiv.com/uiguide/faq/faq-other/setting_bteffect.html
7. Second Life Wiki, Avatar Rendering Complexity: https://wiki.secondlife.com/wiki/Avatar_Rendering_Complexity
8. Second Life Wiki, Avatar Impostors tech details (last edited 2009): https://wiki.secondlife.com/wiki/Avatar_Impostors_tech_details
9. Black Desert official wiki, settings: https://www.naeu.playblackdesert.com/en-US/Wiki?wikiNo=14
10. Blizzard Watch on WoW 11.2 Spell Density (secondary source quoting Blizzard): https://blizzardwatch.com/2025/07/28/blizzard-adding-new-ways-reduce-spell-density-better-performance-visibility-patch-11-2
11. Unreal, Animation Budget Allocator: https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-budget-allocator-in-unreal-engine
12. Unreal, Animation Optimization (update rate optimisation): https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-optimization-in-unreal-engine
13. Unreal, Animation Sharing plugin: https://dev.epicgames.com/documentation/en-us/unreal-engine/animation-sharing-plugin-in-unreal-engine
14. Unity, AnimatorCullingMode: https://docs.unity.com/en-us/engine/current/script-reference/unityengine/animatorcullingmode
15. Unreal, Working with Modular Characters: https://dev.epicgames.com/documentation/en-us/unreal-engine/working-with-modular-characters-in-unreal-engine
16. "1500 Archers on a 28.8" (Age of Empires): https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond
17. Forrest Smith, "The Tech of Planetary Annihilation: ChronoCam": https://forrestthewoods.com/blog/tech_of_planetary_annihilation_chrono_cam/
18. Factorio Friday Facts #156: https://factorio.com/blog/post/fff-156
19. Factorio Friday Facts #302: https://factorio.com/blog/post/fff-302
20. Unreal, Iris prioritization: https://dev.epicgames.com/documentation/en-us/unreal-engine/iris-prioritization-in-unreal-engine
21. Warcraft Wiki, Phase (phasing, sharding, layering): https://warcraft.wiki.gg/wiki/Phase
22. three.js forum, many skinned meshes: https://discourse.threejs.org/t/optimization-of-large-amounts-100-1000-of-skinned-meshes-cpu-bottlenecks/58196
23. three-vat: https://github.com/MikeFernandez-Pro/three-vat
24. Babylon.js, baked texture animations: https://doc.babylonjs.com/features/featuresDeepDive/animation/baked_texture_animations
25. three.js forum, InstancedMesh2: https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344
26. three.js forum, "One Draw Call, Massive Crowd": https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928

**Could not open, so nothing above rests on them:** Guild Wars 2 Wiki "Generic character models"
(HTTP 500); Second Life's knowledge base article on avatar complexity (403); wowdev.wiki (403:
whether World of Warcraft composes a character's textures into one is unconfirmed); Unreal's
`FAnimUpdateRateParameters` API page (empty and 403: the frame-skip table by level of detail is
unconfirmed); a Reddit thread claiming 20,000 skinned instances with InstancedMesh2 (403); an Icy
Veins guide said to recommend capping New World name plates at 15 (403); a mirror of an ArenaNet
developer's post on fallback models (redirected to a local address, not followed).
