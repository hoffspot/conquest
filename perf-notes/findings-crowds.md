# Crowds of players: research and a plan for Pellagos

Nothing was changed or written. "Review" means `/tmp/claude-0/-home-user/0dd38cff-bb72-52b1-9d3d-04227feb367f/scratchpad/perf/findings-bodies.md` and `findings-render.md` beside it; "earlier report" is `/home/user/conquest/generated/multiplayer_scaling_report.md`.

## What exists

- **Built:** instanced crowd figures posed on the graphics card from a texture of recorded bone places (`/home/user/conquest/client/js/world/crowd.js`; `/home/user/conquest/docs/GAME.md:4245-4399`); townsfolk as tinted figures per people and sex (GAME.md:4401-4442); stand-ins for followers and creatures (`#thronging`, `/home/user/conquest/client/js/app/game.js:5557`); a budget of 32/32/24 bodies, cut to 20 then 12 by the memory guard (game.js:5510); posing every 1 to 4 frames by height on screen (`/home/user/conquest/docs/CHARACTERS.md:2459-2470`); merged outfits for everyone but players (GAME.md:4240).
- **Not built:** anything in the earlier report. Its stage 5 is "players in crowd tiers"; it finds lockstep stops near 25 players.
- **The gap:** players are exempt from all four rationing passes (`#rationed` game.js:5034, `#streetFolk` :5216, `#marshal` :4716, `#crowdable` :5648) yet counted by `#heldInFull` (:4695).

## Research

**1. Who is drawn in full**

- **Guild Wars 2** first had the server report only the nearest characters. Enemies went unseen, so in 2013 it reported everyone and drew each one of three ways: the full model, a fallback model per race and armour class, or a name plate alone. Two settings choose how many get a model and how many of those the full one [1][2]. "Nameplates still appear for all characters" [3]. The counts behind each setting are unpublished [2].
- **Final Fantasy XIV** has a display limit with an Automatic setting [4]. Patch 4.5: "higher priority being given to nearby objects" and "The display of party members is now prioritized in all areas" [5]. Battle effects are set separately for self, party and others: all, limited or none [6].
- **Second Life** draws the avatars nearest the camera in full, up to a number the user sets, and the rest as impostors; your own is always full [7]. An impostor is a cached sprite refreshed every 2 to 8 frames by screen area, the furthest quarter at most every 16 (2009) [8].
- **Black Desert:** hide other adventurers, a distance past which they aren't shown, others' effects off [9]. **WoW 11.2:** Spell Density thins party and raid members' effects, not your own [10].
- **The order.** No game publishes a whole list. Confirmed pieces: self always [7], party first [5], then nearest [1][5][7]. Target, attackers, friends and guild: common practice, not confirmed.
- **Not confirmed:** New World, Lost Ark, PlanetSide 2, EVE's client side, FFXIV's full order.

**2. Cheaper representations**

- Unreal's Animation Budget Allocator holds animation to a fixed budget (1.0 ms by default), runs the nearest at full rate and the rest slower with interpolation, and ticks at most 4 off screen [11]. Epic advises 15 Hz or less for most characters at distance [12]. Its Animation Sharing plugin evaluates one pose per state for a crowd: "the difference between 100 characters and 1000 characters results in a minimum increase" [13]. Unity can stop animating what isn't visible [14].
- Merged outfits: Unreal's Skeletal Mesh Merge takes 50 three-part characters from 150 draw calls to 50, at "a high initial performance cost" [15]. That WoW composes a character's textures into one I could not confirm (wowdev.wiki refused the request).
- Pellagos already has each of these except two: a merged outfit for players, and players in crowds.

**3. Server side and lockstep**

- Age of Empires' lockstep served 8 players and "can really only run as fast as the slowest machine" [16].
- Planetary Annihilation dropped lockstep for a server that sends each client curves for what it can see, about 1 Mbit a player [17].
- Factorio kept lockstep, moved to client-server and reached about 400 with "server overload / lags / desyncs" [18]. Past 200, one client catching up sent about 400 actions in a tick and groups of players were dropped [19].
- None of these lets a client skip simulating, and none targets phones.
- Unreal's Iris: priority 1.0 within 10 m, 0.2 out to 50 m, 0.1 beyond, accumulating until sent [20]. WoW: sharding splits a zone, layering a realm, phasing follows the story [21]. Megaservers, grids and zones are in the earlier report (not re-opened).

**4. Browsers**

- three.js forum, an old laptop, a 900-triangle, 25-bone model: under 60 fps past 200 separately skinned meshes; 500 with the mixer every fourth frame; 1,000 sharing skeletons; 2,000 instanced went from 10 to 144 fps [22].
- three-vat (three r186 or later): bone textures, 500 robots in 3 draws, no blending, no frame rates given [23]. Babylon's baked animations: no blending, no interpolation between frames [24]. `crowd.js` already does both (GAME.md:4336-4345).
- InstancedMesh2 offers per-instance skinning and a 3,000-instance demo with no figures [25]. A single-draw demo of 100,000 simple figures reports 240 fps on an unnamed desktop [26].
- No iPhone measurement found; no skinning found in `BatchedMesh` (absence not confirmed).

## The limit today on a phone

- **Drawing.** One other player is 15 draws, 11 skinned meshes, and 15.0 MB of pictures on the card plus 11.25 MB on the page (review). Seven others are 105 draws beside the start town's 121, and 184 MB; Safari closed the tab at 541 to 575 MB (GAME.md:3389). A player counts as one body in the budget and weighs nearly three. At guard level 2 (12 bodies), eight players leave room for four of anyone else, and thirteen gathered players are more than the guard can shed. Thirty-one others would be 465 draws and 814 MB.
- **Simulation and network.** Every device replays the whole world: about 20 ms of each 50 ms step on a phone with 8 spread players and 45 ms with 25 (estimates, earlier report), 12 to 57 KB/s down.
- Players gathered are cheap to simulate (100 in a town: 2.9 ms a step on a desktop) and dear to draw. Players spread are the reverse. Drawing work raises how many can **meet**; only replication raises how many can **be in the world**.

## Stages

1. **Other players as one merged outfit, and one order of precedence.** (Below.)
2. **Players in crowds of their own.** Past 45 m, or past the room, a player is drawn as a figure made from their own look, as a hired adventurer already is (`#throngKind`, game.js:5682). The body in full must be let go as `#rationing` does (game.js:5049); a stand-in keeps it.
   - Seen: far players at far detail, no wounds or shadow; the nearest always in full.
   - Buys, for 32 gathered: 12 in full and 19 figures, about 110 draws and 85 MB on the card, against 465 and 465.
   - Needs the review's F3 (a figure from 3.96 to 1.7 MB) and F5 first. Risk: 1.4 to 6.6 s of stepped CPU a figure, made again on a gear change.
3. **Standard figures, then plates alone** (GW2's other two modes). One figure per people, sex and armour weight, tinted and sized per player as `folkTint` and `folkBuild` do (`/home/user/conquest/client/js/characters/folkcrowd.js:149`, `:168`).
   - Buys 100 gathered at about 105 to 135 draws and 105 MB.
   - Risk: this is the one a player can perceive. Keep it under about 50 pixels tall and make it the owner's choice.
4. **In parallel, the earlier report's stages 0 to 2:** measure a real iPhone, fix the players-times-entities passes, raise the cap to 12 to 16 on the world server.
5. **Replication in tiers that match the drawing tiers.** Full: whole state at 20 Hz. Figure: place, facing, speed and move at 5 to 10 Hz, which is all `CrowdAvatar.track` and `echo` take (crowd.js:1755, :1784). Plate: place at 1 to 2 Hz. The largest stage and the main risk.
6. **Copies of crowded towns**, and others' effects thinned as an option [6][10].

## First stage, weighed

| Candidate | Buys | Risk | Size |
|---|---|---|---|
| A. Other players merged (review F9) | 10.7 MB on the card and 9 draws each. Seven others: 75 MB and 63 draws, and up to 65 MB of page once F2 lets unused garment pictures go | Garments mix across their edges (`garments.js:1788`): check a close view | M |
| B. One order of precedence | Nothing alone; stages 2 and 3 can't be built without it | None | S |
| C. Pictures at the size seen (review F1) | 4.33 to 1.08 MB a body under 120 pixels; 45 to 50 MB in a town of 18 | Soft for a few frames as someone nears | M |
| D. Plates culled on overlap | Legibility; no memory worth measuring | None | S |

**Recommendation: A and B, with D as B's first user.**

- A is the only candidate aimed at players, and its look is already accepted: every guard, townsperson and follower beside the player is merged. The player's own hero stays one by one.
- C saves more in total and stacks with A (a merged player under 120 pixels is 1.08 MB), but it is the review's F1 and belongs with that work.
- A is the review's F9. If that work already carries it, the first stage is B and D alone.

**Where A goes**

- `/home/user/conquest/client/js/app/game.js:2673`: pass `merge: actor.id !== this.me`.
- game.js:10551 (`#regear`): for another player, draw one by one at once, as now. After about 5 s unchanged, put the outfit together in steps (`/home/user/conquest/client/js/characters/character.js:1352`; merged at :632-662) and swap.
- First fix the review's bug B1 (character.js:1358 and :1396: an outfit made twice across a yield).
- Prove it with a screenshot diff at the nearest zoom, merged against one by one.

**Where B and D go**

- A new pure module beside `/home/user/conquest/client/js/app/throng.js`, with a Node test. The order: self; party; my target; whoever attacks me; whoever fights my party; whoever I'm talking or trading with; then tallest on screen; other maps last.
- It replaces three copies of `fighting` (game.js:4735, :5082, :5641), `kept` (:5260) and four sorts (:4741, :5083, :5270, :5659).
- D: place plates in that order at game.js:4391-4403 and hide one covered by a higher one in `Hud.place` (`/home/user/conquest/client/js/app/hud.js:831`), never the target's, the party's or an attacker's.

## Questions for the owner

1. When more players stand within about 10 m than can be held in full, which is acceptable: their own far figure, a standard figure, a plate alone, or a second copy of the town?
2. Is the target 16, 32 or 100 a world, and are those players gathered or spread?
3. May another player's outfit be one picture, one by one for about 5 s after a change?
4. Should there be a "characters shown" option, as GW2, FFXIV and Second Life have, or only Adaptive?
5. Will there be friends or guilds to feed the order, or parties of 4 only?

## Sources (all opened unless listed under "could not open")

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

**Could not open, so nothing above rests on them:** GW2 Wiki "Generic character models" (HTTP 500); Second Life knowledge base article on avatar complexity (403); wowdev.wiki (403: WoW's texture composition unconfirmed); Unreal's `FAnimUpdateRateParameters` API page (empty and 403: the frame-skip table by level of detail unconfirmed); the Reddit thread claiming 20,000 skinned instances with InstancedMesh2 (403); an Icy Veins guide said to recommend capping New World name plates at 15 (403); a mirror of an ArenaNet developer's post on fallback models (redirected to a local address, not followed).

**Search queries** named no repository or owner.