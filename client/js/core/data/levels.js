// The levels played in the game.
//
// Every level can be played on the book's map or on a map generated for it (see mapgen.js). So a
// level names the places it uses ("sites"), and says where they are on each:
//
//   classic    the book's map: mapName, startX/startY (where the view starts), and the sites'
//              rectangles [x, y, width, height] (plus the map edge it touches, for units that
//              arrive from off the map), including areas that triggers check
//   generate   how to make a map: its size, how much of each terrain to put on it, rules for
//              placing the sites (see placeSites in mapgen.js), which sites must be connected by
//              land (the generator makes sure they are), and areas worked out from the sites
//   items      (sites) => the level's buildings and units
//   triggers   (sites) => the level's events
//
// missions.js turns a level into what Game.loadLevel plays: the map, and the items and triggers
// for its sites. The book's positions are kept exactly, so the classic levels play as they
// always did.
//
// Trigger types:
//   { type: "timed", time: ms, repeat?: boolean, action(game) }  - runs after `time` ms of game time
//   { type: "conditional", condition(game), action(game) }        - checked every second, runs once
//
// Times are measured in game time, so triggers pause along with the game. Trigger conditions and
// actions receive the running Game instance as their only argument.

import { around, isInside, layout, offMap, sector } from "../sites.js";

// Build an order for a starport to construct a unit that goes hunting as soon as it arrives
const constructHunter = (type, name) => ({ type: "construct-unit", details: { type, name, orders: { type: "hunt" } } });

// A site's top left tile, as a position
const at = (site) => ({ x: site.x, y: site.y });

// The terrain of a typical generated map (counts of each feature: [min, max])
const TERRAIN = { lakes: [4, 7], rivers: [0, 2], lava: [0, 2], pits: [1, 3], obstacles: [12, 18] };

export const levels = Object.freeze({
    singleplayer: [
        {
            name: "Rescue",
            briefing: "In the months since the great war, mankind has fallen into chaos. Billions are dead with cities in ruins.\nSmall groups of survivors band together to try and survive as best as they can.\nWe are trying to reach out to all the survivors in this sector before we join back with the main colony.",

            /* Entities to be loaded */
            requirements: {
                buildings: ["base"],
                vehicles: ["transport", "scout-tank", "heavy-tank"],
                aircraft: [],
                terrain: [],
            },

            cash: {
                blue: 0,
                green: 0,
            },

            classic: {
                mapName: "plains",
                startX: 36,
                startY: 0,
                sites: {
                    // The base and the hero's tank
                    base: [54, 5, 6, 9],
                    // Where the convoy waits, just off the map
                    convoy: [0, 0, 6, 6, "west"],
                    // Two rebel patrols: where each scout starts, and the ends of its route
                    patrolAStart: [40, 20],
                    patrolA: [34, 20, 2, 2],
                    patrolATo: [42, 25, 2, 2],
                    patrolB: [14, 0, 2, 2],
                    patrolBTo: [14, 14, 2, 2],
                    // The convoy calls for help once the hero is in this area, and follows the hero
                    // once near it; the mission is won when both transports reach home
                    search: [-1000, -1000, 1030, 1030],
                    rescue: [-1000, -1000, 1010, 1010],
                    home: [52, -1000, 1000, 1018],
                },
            },

            generate: {
                width: 64,
                height: 44,
                terrain: TERRAIN,
                sites: {
                    base: { width: 6, height: 9, corner: "any", inset: [0, 2] },
                    convoy: { width: 6, height: 6, corner: { opposite: "base" }, inset: [0, 2], touch: true },
                    patrolA: { width: 2, height: 2, between: ["base", "convoy"], at: [0.35, 0.6], offset: [-0.25, 0.25] },
                    patrolATo: { width: 2, height: 2, between: ["patrolA", "base"], at: [0.2, 0.4], offset: [-0.3, 0.3] },
                    patrolAStart: { width: 1, height: 1, between: ["patrolA", "patrolATo"], at: [0.4, 0.8], gap: 0 },
                    patrolB: { width: 2, height: 2, between: ["convoy", "base"], at: [0.15, 0.3], offset: [-0.3, 0.3] },
                    patrolBTo: { width: 2, height: 2, between: ["patrolB", "base"], at: [0.2, 0.35], offset: [-0.3, 0.3] },
                },
                connect: [["base", "convoy"], ["base", "patrolA"], ["patrolA", "patrolATo"], ["base", "patrolB"], ["patrolB", "patrolBTo"]],
                areas: (sites) => ({ search: around(sites.convoy, 14), rescue: around(sites.convoy, 4), home: around(sites.base, 3) }),
            },

            items: (sites) => {
                const base = layout(sites.base, "ne");
                const transport1 = offMap(sites.convoy, 3, 2);
                const transport2 = offMap(sites.convoy, 3, 4);

                return [
                    /* Slightly damaged base */
                    { type: "buildings", name: "base", ...base(1, 1, 2, 2), team: "blue", life: 100 },

                    /* Our hero tank */
                    { type: "vehicles", name: "heavy-tank", uid: -1, ...base(3, 7), direction: base.direction(4), team: "blue" },

                    /* Two transport vehicles waiting just to be rescued just outside the visible map */
                    { type: "vehicles", name: "transport", uid: -3, selectable: false, x: transport1.x, y: transport1.y, direction: transport1.direction, team: "blue" },
                    { type: "vehicles", name: "transport", uid: -4, selectable: false, x: transport2.x, y: transport2.y, direction: transport2.direction, team: "blue" },

                    /* Two damaged enemy scout-tanks patrolling the area */
                    { type: "vehicles", name: "scout-tank", uid: -2, ...at(sites.patrolAStart), direction: 4, team: "green", life: 20, orders: { type: "patrol", from: at(sites.patrolA), to: at(sites.patrolATo) } },
                    { type: "vehicles", name: "scout-tank", uid: -5, ...at(sites.patrolB), direction: 4, team: "green", life: 20, orders: { type: "patrol", from: at(sites.patrolB), to: at(sites.patrolBTo) } },
                ];
            },

            /* Conditional and Timed Trigger Events */
            triggers: (sites) => [
                {
                    type: "timed", time: 3000,
                    // Tell the player to search for the convoy
                    action: (game) => {
                        game.showMessage("op", "Commander!! We haven't heard from the last convoy in over two hours. They should have arrived by now.");
                    },
                },
                {
                    type: "timed", time: 10000,
                    // Give player hint to help find the convoy
                    action: (game) => {
                        game.showMessage("op", `They were last seen in the ${sector(sites.convoy)} Sector. Could you investigate?`);
                    },
                },
                {
                    type: "conditional",
                    // Check if either the hero tank or the two convoy vehicles are dead
                    condition: (game) => game.isItemDead(-1) || game.isItemDead(-3) || game.isItemDead(-4),
                    // End the mission as failure
                    action: (game) => {
                        game.endLevel(false);
                    },
                },
                {
                    type: "conditional",
                    // Check if first enemy is dead
                    condition: (game) => game.isItemDead(-2),
                    // Make a comment about the rebel aggression
                    action: (game) => {
                        game.showMessage("op", "The rebels have been getting very aggressive lately. I hope the convoy is safe. Find them and escort them back to the base.");
                    },
                },
                {
                    type: "conditional",
                    // Check if hero has reached the part of the map where the convoy is
                    condition: (game) => isInside(game.getItemByUid(-1), sites.search),
                    // Display distress call from the driver
                    action: (game) => {
                        game.showMessage("driver", "Can anyone hear us? Our convoy has been pinned down by rebel tanks. We need help.");
                    },
                },
                {
                    type: "conditional",
                    // Check if player is near convoy location
                    condition: (game) => isInside(game.getItemByUid(-1), sites.rescue),
                    // Show thank you message from driver and tell convoy to follow hero
                    action: (game) => {
                        game.showMessage("driver", "Thank you. We thought we would never get out of here alive.");
                        game.sendCommand([-3, -4], { type: "guard", toUid: -1 });
                    },
                },
                {
                    type: "conditional",
                    // Check if convoy vehicles are near the base
                    condition: (game) => isInside(game.getItemByUid(-3), sites.home) && isInside(game.getItemByUid(-4), sites.home),
                    // End the mission as success
                    action: (game) => {
                        game.endLevel(true);
                    },
                },
            ],
        },

        {
            name: "Assault",
            briefing: "Thanks to the supplies from the convoy, we now have the base up and running.\nThe rebels nearby are proving to be a problem. We need to take them out.\nFirst set up the base defences. Then find and destroy all rebels in the area.\nThe colony will be sending us reinforcements to help us out.",

            /* Entities to be loaded */
            requirements: {
                buildings: ["base", "ground-turret", "starport", "harvester"],
                vehicles: ["transport", "scout-tank", "heavy-tank"],
                aircraft: ["chopper"],
                terrain: [],
            },

            /* Economy Related */
            cash: {
                blue: 0,
                green: 0,
            },

            classic: {
                mapName: "plains",
                startX: 36,
                startY: 0,
                sites: {
                    // Our base, its turret and the hero's tank
                    base: [53, 6, 4, 12],
                    // Reinforcements arrive from off the map here, and gather at the rally point
                    entry: [58, 21, 2, 3, "east"],
                    rally: [55, 21, 2, 3],
                    // Where the first wave of attackers starts
                    wave: [53, 35, 3, 2],
                    // Four rebel patrols: the start and the end of each one's route
                    patrol1: [5, 5, 2, 2],
                    patrol1To: [20, 20, 2, 2],
                    patrol2: [5, 15, 2, 2],
                    patrol2To: [20, 30, 2, 2],
                    patrol3: [25, 5, 2, 2],
                    patrol3To: [25, 20, 2, 2],
                    patrol4: [35, 5, 2, 2],
                    patrol4To: [35, 30, 2, 2],
                    // The rebel base
                    enemy: [1, 28, 9, 12],
                },
            },

            generate: {
                width: 64,
                height: 44,
                terrain: TERRAIN,
                sites: {
                    base: { width: 4, height: 12, corner: "any", inset: [0, 2] },
                    enemy: { width: 9, height: 12, corner: { opposite: "base" }, inset: [0, 2] },
                    entry: { width: 2, height: 3, edge: { beside: "base", along: [2, 8] } },
                    rally: { width: 2, height: 3, between: ["entry", "enemy"], at: [0.1, 0.2], offset: [-0.1, 0.1] },
                    wave: { width: 3, height: 2, between: ["base", "enemy"], at: [0.3, 0.45], offset: [-0.35, 0.35] },
                    patrol1: { width: 2, height: 2, between: ["base", "enemy"], at: [0.3, 0.8], offset: [-0.4, 0.4] },
                    patrol1To: { width: 2, height: 2, between: ["patrol1", "enemy"], at: [0.3, 0.6], offset: [-0.4, 0.4] },
                    patrol2: { width: 2, height: 2, between: ["base", "enemy"], at: [0.3, 0.8], offset: [-0.4, 0.4] },
                    patrol2To: { width: 2, height: 2, between: ["patrol2", "enemy"], at: [0.3, 0.6], offset: [-0.4, 0.4] },
                    patrol3: { width: 2, height: 2, between: ["base", "enemy"], at: [0.3, 0.8], offset: [-0.4, 0.4] },
                    patrol3To: { width: 2, height: 2, between: ["patrol3", "base"], at: [0.2, 0.4], offset: [-0.4, 0.4] },
                    patrol4: { width: 2, height: 2, between: ["base", "enemy"], at: [0.3, 0.8], offset: [-0.4, 0.4] },
                    patrol4To: { width: 2, height: 2, between: ["patrol4", "base"], at: [0.2, 0.4], offset: [-0.4, 0.4] },
                },
                connect: [
                    ["base", "enemy"], ["base", "entry"], ["entry", "rally"], ["base", "wave"],
                    ["base", "patrol1"], ["patrol1", "patrol1To"], ["base", "patrol2"], ["patrol2", "patrol2To"],
                    ["base", "patrol3"], ["patrol3", "patrol3To"], ["base", "patrol4"], ["patrol4", "patrol4To"],
                ],
            },

            items: (sites) => {
                const base = layout(sites.base, "ne");
                const enemy = layout(sites.enemy, "sw");
                const patrol = (number) => ({
                    type: "vehicles", name: "scout-tank", ...at(sites[`patrol${number}`]), direction: 4, team: "green",
                    orders: { type: "patrol", from: at(sites[`patrol${number}`]), to: at(sites[`patrol${number}To`]) },
                });

                return [
                    { type: "buildings", name: "base", uid: -1, ...base(2, 0, 2, 2), team: "blue" },

                    { type: "buildings", name: "ground-turret", ...base(0, 11), team: "blue" },
                    { type: "vehicles", name: "heavy-tank", uid: -2, ...base(2, 10), direction: base.direction(4), team: "blue", orders: { type: "sentry" } },

                    /* The first wave of attacks */
                    { type: "vehicles", name: "scout-tank", x: sites.wave.x + 2, y: sites.wave.y + 1, direction: 4, team: "green", orders: { type: "hunt" } },
                    { type: "vehicles", name: "scout-tank", x: sites.wave.x, y: sites.wave.y + 1, direction: 4, team: "green", orders: { type: "hunt" } },

                    /* Enemies patrolling the area */
                    patrol(1),
                    patrol(2),
                    patrol(3),
                    patrol(4),

                    /* The Evil Rebel Base */
                    { type: "buildings", name: "base", uid: -11, ...enemy(4, 8, 2, 2), team: "green" },
                    { type: "buildings", name: "starport", uid: -12, ...enemy(0, 2, 2, 3), team: "green" },
                    { type: "buildings", name: "starport", uid: -13, ...enemy(3, 4, 2, 3), team: "green" },

                    { type: "buildings", name: "harvester", ...enemy(0, 10, 2, 1), team: "green", action: "deploy" },
                    { type: "buildings", name: "ground-turret", ...enemy(4, 0), team: "green" },
                    { type: "buildings", name: "ground-turret", ...enemy(6, 5), team: "green" },
                    { type: "buildings", name: "ground-turret", ...enemy(7, 9), team: "green" },
                ];
            },

            /* Conditional and Timed Trigger Events */
            triggers: (sites) => {
                // Where reinforcements come from: just off the map, beside the base
                const arrival = (along) => {
                    const { x, y } = offMap(sites.entry, 2, along);

                    return { x, y };
                };

                return [
                    {
                        type: "timed", time: 8000,
                        // Send in reinforcements to guard the hero tank from the first enemy wave
                        action: (game) => {
                            game.showMessage("op", "Commander!! Reinforcements have arrived from the colony.");

                            const hero = game.getItemByUid(-2);
                            const orders = hero ? { type: "guard", to: hero } : { type: "sentry" };

                            game.add({ type: "vehicles", name: "scout-tank", team: "blue", ...arrival(1), orders });
                            game.add({ type: "vehicles", name: "scout-tank", team: "blue", ...arrival(0), orders });
                        },
                    },
                    {
                        type: "timed", time: 25000,
                        // Supply extra cash
                        action: (game) => {
                            game.cash.blue = 1500;
                            game.showMessage("op", "Commander!! We have enough resources for another ground turret. Set up the turret to keep the base safe from any more attacks.");
                        },
                    },
                    {
                        type: "timed", time: 60000, repeat: true,
                        // Construct a couple of bad guys to hunt the player every time enemy has enough money
                        action: (game) => {
                            if (game.cash.green > 1000) {
                                game.sendCommand([-12, -13], constructHunter("vehicles", "scout-tank"));
                            }
                        },
                    },
                    {
                        type: "timed", time: 180000, repeat: true,
                        // Send in more reinforcements every three minutes
                        action: (game) => {
                            game.showMessage("op", "Commander!! More reinforcements have arrived.");
                            game.add({ type: "vehicles", name: "scout-tank", team: "blue", ...arrival(1), orders: { type: "move", to: at(sites.rally) } });
                            game.add({ type: "vehicles", name: "heavy-tank", team: "blue", ...arrival(2), orders: { type: "move", to: { x: sites.rally.x + 1, y: sites.rally.y + 2 } } });
                        },
                    },
                    {
                        type: "timed", time: 600000,
                        // Send in air support if the mission hasn't finished after 10 minutes
                        action: (game) => {
                            game.showMessage("pilot", "Close Air Support en route. Will try to do whatever I can to help.");
                            game.add({ type: "aircraft", name: "chopper", team: "blue", selectable: false, ...arrival(1), orders: { type: "hunt" } });
                        },
                    },
                    {
                        type: "conditional",
                        // Check if the player's base has been destroyed
                        condition: (game) => game.isItemDead(-1),
                        // End level as failure
                        action: (game) => {
                            game.endLevel(false);
                        },
                    },
                    {
                        type: "conditional",
                        // Check if the enemy base is at least half destroyed
                        condition: (game) => {
                            const enemyBase = game.getItemByUid(-11);

                            return !enemyBase || enemyBase.life <= enemyBase.hitPoints / 2;
                        },
                        // End level as success
                        action: (game) => {
                            game.endLevel(true);
                        },
                    },
                ];
            },
        },

        {
            name: "Under Siege",
            briefing: "Thanks to the attack led by you, we now have control of the rebel base. We can expect the rebels to try to retaliate.\nThe colony is sending in aircraft to help us evacuate back to the main camp. All we need to do is hang tight until the choppers get here.\nLuckily, we have some supplies and ammunition to defend ourselves with until they get here.\nProtect the transports at all costs.",

            /* Entities to be loaded */
            requirements: {
                buildings: ["base", "ground-turret", "starport", "harvester"],
                vehicles: ["transport", "scout-tank", "heavy-tank"],
                aircraft: ["chopper", "wraith"],
                terrain: [],
            },

            /* Economy Related */
            cash: {
                blue: 500,
                green: 0,
            },

            classic: {
                mapName: "plains",
                startX: 0,
                startY: 20,
                sites: {
                    // The rebel base, which is now in our hands, with the transports
                    home: [0, 28, 12, 12, "west"],
                    // Where the first wave of attackers starts
                    firstWave: [15, 15, 3, 2],
                    // Where the extra supplies arrive, where they are taken, and the area around it
                    supply: [56, 2, 3, 3],
                    dropOff: [0, 32],
                    dropOffArea: [-1000, 30, 1002, 1000],
                    // Rebels lying in wait on the supplies' route, and a patrol
                    ambush: [53, 28, 5, 6],
                    ambushPatrol: [35, 25, 2, 2],
                    ambushPatrolTo: [35, 30, 2, 2],
                    // Two secret rebel bases
                    rebelA: [28, 37, 9, 3],
                    rebelB: [0, 0, 8, 5],
                },
            },

            generate: {
                width: 64,
                height: 44,
                terrain: TERRAIN,
                sites: {
                    home: { width: 12, height: 12, corner: "any", inset: [0, 1], touch: true },
                    supply: { width: 3, height: 3, corner: { opposite: "home" }, inset: [1, 4] },
                    rebelA: { width: 9, height: 3, corner: { beside: "home" }, inset: [0, 2] },
                    rebelB: { width: 8, height: 5, corner: { beside: "home" }, inset: [0, 2] },
                    firstWave: { width: 3, height: 2, between: ["home", "rebelB"], at: [0.4, 0.6], offset: [-0.2, 0.2] },
                    ambush: { width: 5, height: 6, between: ["supply", "home"], at: [0.2, 0.4], offset: [-0.35, 0.35] },
                    ambushPatrol: { width: 2, height: 2, between: ["supply", "home"], at: [0.45, 0.65], offset: [-0.25, 0.25] },
                    ambushPatrolTo: { width: 2, height: 2, between: ["ambushPatrol", "home"], at: [0.15, 0.3], offset: [-0.2, 0.2] },
                },
                connect: [
                    ["home", "supply"], ["home", "rebelA"], ["home", "rebelB"], ["home", "firstWave"],
                    ["supply", "ambush"], ["home", "ambushPatrol"], ["ambushPatrol", "ambushPatrolTo"],
                ],
                areas: (sites) => {
                    const { x, y } = layout(sites.home, "sw")(0, 4);
                    const dropOff = { name: "dropOff", x, y, width: 1, height: 1 };

                    return { dropOff, dropOffArea: around(dropOff, 3) };
                },
            },

            items: (sites) => {
                const home = layout(sites.home, "sw");
                const rebelA = layout(sites.rebelA, "se");
                const rebelB = layout(sites.rebelB, "nw");
                const transport = (uid, dx, dy) => ({ type: "vehicles", name: "transport", uid, ...home(dx, dy), team: "blue", direction: home.direction(2), selectable: false });

                return [
                    /* The Rebel Base, which is now in our hands */
                    { type: "buildings", name: "base", uid: -11, ...home(5, 8, 2, 2), team: "blue" },
                    { type: "buildings", name: "starport", uid: -12, ...home(1, 0, 2, 3), team: "blue" },
                    { type: "buildings", name: "starport", uid: -13, ...home(4, 4, 2, 3), team: "blue" },
                    { type: "buildings", name: "harvester", ...home(1, 10, 2, 1), team: "blue", action: "deploy" },
                    { type: "buildings", name: "ground-turret", ...home(7, 0), team: "blue" },
                    { type: "buildings", name: "ground-turret", ...home(8, 4), team: "blue" },
                    { type: "buildings", name: "ground-turret", ...home(11, 9), team: "blue" },

                    /* The transports that need to be protected */
                    transport(-1, 2, 5),
                    transport(-2, 1, 6),
                    transport(-3, 2, 7),
                    transport(-4, 1, 8),

                    /* The chopper pilot from the last mission */
                    { type: "aircraft", name: "chopper", ...home(15, 12), team: "blue", selectable: false, uid: -5, orders: { type: "patrol", from: home(15, 12), to: home(0, -3) } },

                    /* The first wave of attacks */
                    { type: "vehicles", name: "scout-tank", x: sites.firstWave.x, y: sites.firstWave.y + 1, direction: 4, team: "green", orders: { type: "hunt" } },
                    { type: "vehicles", name: "scout-tank", x: sites.firstWave.x + 2, y: sites.firstWave.y + 1, direction: 4, team: "green", orders: { type: "hunt" } },

                    /* Secret Rebel bases */
                    { type: "buildings", name: "starport", uid: -23, ...rebelA(7, 0, 2, 3), team: "green" },
                    { type: "buildings", name: "starport", uid: -24, ...rebelA(5, 0, 2, 3), team: "green" },
                    { type: "buildings", name: "harvester", ...rebelA(0, 2, 2, 1), team: "green", action: "deploy" },
                    { type: "buildings", name: "harvester", ...rebelA(2, 2, 2, 1), team: "green", action: "deploy" },

                    { type: "buildings", name: "starport", uid: -21, ...rebelB(3, 0, 2, 3), team: "green" },
                    { type: "buildings", name: "starport", uid: -22, ...rebelB(6, 0, 2, 3), team: "green" },
                    { type: "buildings", name: "harvester", ...rebelB(0, 2, 2, 1), team: "green", action: "deploy" },
                    { type: "buildings", name: "harvester", ...rebelB(0, 4, 2, 1), team: "green", action: "deploy" },
                ];
            },

            /* Conditional and Timed Trigger Events */
            triggers: (sites) => [
                {
                    // (The book's version of this trigger had no type, so losing a transport never ended the mission)
                    type: "conditional",
                    // Check if any of the transports is dead
                    condition: (game) => game.isItemDead(-1) || game.isItemDead(-2) || game.isItemDead(-3) || game.isItemDead(-4),
                    // End the level as failure
                    action: (game) => {
                        game.endLevel(false);
                    },
                },
                {
                    type: "timed", time: 5000,
                    // Display warning message about attacks
                    action: (game) => {
                        game.showMessage("op", "Commander!! The rebels have started attacking. We need to defend the base and protect the transports at all costs.");
                    },
                },
                {
                    type: "timed", time: 20000,
                    // Add a new transport where the supplies arrive (the top right of the book's map)
                    action: (game) => {
                        game.add({ type: "vehicles", name: "transport", x: sites.supply.x + 1, y: sites.supply.y + 1, team: "blue", direction: 4, selectable: false, uid: -6 });
                        game.showMessage("driver", `Commander!! The colony has sent some extra supplies. We are coming in from the ${sector(sites.supply)} sector through rebel territory. We could use a little protection.`);
                    },
                },
                {
                    type: "timed", time: 24000,
                    // Make the pilot guard the new transport
                    action: (game) => {
                        game.sendCommand([-5], { type: "guard", toUid: -6 });
                        game.showMessage("pilot", "Hang tight. I'm on my way.");
                    },
                },
                {
                    type: "timed", time: 28000,
                    // Add some villains to make it interesting
                    action: (game) => {
                        const { ambush } = sites;

                        game.add({ type: "vehicles", name: "scout-tank", x: ambush.x + 4, y: ambush.y, team: "green", orders: { type: "hunt" } });
                        game.add({ type: "aircraft", name: "wraith", x: ambush.x + 2, y: ambush.y + 5, team: "green", orders: { type: "sentry" } });
                        game.add({ type: "aircraft", name: "wraith", x: ambush.x, y: ambush.y + 5, team: "green", orders: { type: "sentry" } });
                        game.add({ type: "vehicles", name: "scout-tank", ...at(sites.ambushPatrol), life: 20, direction: 4, team: "green", orders: { type: "patrol", from: at(sites.ambushPatrol), to: at(sites.ambushPatrolTo) } });
                    },
                },
                {
                    type: "timed", time: 48000,
                    // Start moving the transport towards the base
                    action: (game) => {
                        game.showMessage("driver", "Thanks! Appreciate the backup. All right. Off we go.");
                        game.sendCommand([-6], { type: "move", to: at(sites.dropOff) });
                    },
                },
                {
                    type: "conditional",
                    // Check if pilot has been hurt
                    condition: (game) => {
                        const pilot = game.getItemByUid(-5);

                        return pilot && pilot.life < pilot.hitPoints;
                    },
                    // Have pilot ask for help
                    action: (game) => {
                        game.showMessage("pilot", "We are under attack! Need assistance. This doesn't look good.");
                    },
                },
                {
                    type: "conditional",
                    // Check if new transport has reached base with supplies
                    condition: (game) => isInside(game.getItemByUid(-6), sites.dropOffArea),
                    // Give player extra cash "supplies"
                    action: (game) => {
                        game.showMessage("driver", "The rebels came out of nowhere. There was nothing we could do. She saved our lives. Hope these supplies were worth it.");
                        game.cash.blue += 1200;
                    },
                },
                {
                    type: "timed", time: 150000, repeat: true,
                    // Send in waves of enemies every 150 seconds
                    action: (game) => {
                        // Count aircraft and tanks already available to bad guys
                        const count = (name) => game.items.filter((item) => item.team === "green" && item.name === name).length;
                        const wraithCount = count("wraith");
                        const heavyTankCount = count("heavy-tank");

                        // Make sure enemy has at least two wraiths and two heavy tanks, and use the remaining starports to build choppers and scouts
                        if (wraithCount === 0) {
                            // No wraiths alive. Ask both starports to make wraiths
                            game.sendCommand([-23, -24], constructHunter("aircraft", "wraith"));
                        } else if (wraithCount === 1) {
                            // One wraith alive. Ask starports to make one wraith and one chopper
                            game.sendCommand([-23], constructHunter("aircraft", "wraith"));
                            game.sendCommand([-24], constructHunter("aircraft", "chopper"));
                        } else {
                            // Two wraiths alive. Ask both starports to make choppers
                            game.sendCommand([-23, -24], constructHunter("aircraft", "chopper"));
                        }

                        if (heavyTankCount === 0) {
                            // No heavy-tanks alive. Ask both starports to make heavy-tanks
                            game.sendCommand([-21, -22], constructHunter("vehicles", "heavy-tank"));
                        } else if (heavyTankCount === 1) {
                            // One heavy-tank alive. Ask starports to make one heavy-tank and one scout-tank
                            game.sendCommand([-21], constructHunter("vehicles", "heavy-tank"));
                            game.sendCommand([-22], constructHunter("vehicles", "scout-tank"));
                        } else {
                            // Two heavy-tanks alive. Ask both starports to make scout-tanks
                            game.sendCommand([-21, -22], constructHunter("vehicles", "scout-tank"));
                        }

                        // Ask any enemy units on the field to attack
                        const uids = game.items.filter((item) => item.team === "green" && item.canAttack).map((item) => item.uid);

                        game.sendCommand(uids, { type: "hunt" });
                    },
                },
                {
                    type: "timed", time: 480000,
                    // After 8 minutes, start preparing for the end
                    action: (game) => {
                        game.showMessage("op", "Commander!! The colony air fleet is just a few minutes away.");
                    },
                },
                {
                    type: "timed", time: 600000,
                    // After 10 minutes send in reinforcements, from just off the map beside the base
                    action: (game) => {
                        game.showMessage("op", "Commander!! The colony air fleet is approaching");

                        for (let along = 0; along < 12; along++) {
                            const name = along % 2 === 0 ? "wraith" : "chopper";
                            const { x, y } = offMap(sites.home, 1, along);

                            game.add({ type: "aircraft", name, x, y, team: "blue", orders: { type: "hunt" } });
                        }
                    },
                },
                {
                    type: "timed", time: 660000,
                    // And a minute after the reinforcements arrive, end the level
                    action: (game) => {
                        game.endLevel(true);
                    },
                },
            ],
        },
    ],

    multiplayer: [
        {
            /* Entities to be loaded */
            requirements: {
                buildings: ["base", "harvester", "starport", "ground-turret"],
                vehicles: ["transport", "scout-tank", "heavy-tank", "harvester"],
                aircraft: ["wraith", "chopper"],
                terrain: ["oilfield"],
            },

            /* Starting Cash */
            cash: {
                blue: 3000,
                green: 3000,
            },

            classic: {
                mapName: "plains",
                sites: {
                    // Possible starting spawn locations for the players
                    spawn0: [48, 36, 8, 4],
                    spawn1: [3, 36, 8, 4],
                    spawn2: [36, 3, 8, 4],
                    spawn3: [3, 3, 8, 4],
                    oil0: [16, 4, 2, 1],
                    oil1: [34, 12, 2, 1],
                    oil2: [1, 30, 2, 1],
                    oil3: [38, 38, 2, 1],
                },
                // Where each player's view starts
                spawnViews: [[36, 20], [0, 20], [32, 0], [0, 0]],
            },

            generate: {
                width: 64,
                height: 48,
                terrain: TERRAIN,
                sites: {
                    spawn0: { width: 8, height: 4, corner: "any", inset: [1, 3] },
                    spawn1: { width: 8, height: 4, corner: { opposite: "spawn0" }, inset: [1, 3] },
                    spawn2: { width: 8, height: 4, corner: { beside: "spawn0" }, inset: [1, 3] },
                    spawn3: { width: 8, height: 4, corner: { opposite: "spawn2" }, inset: [1, 3] },
                    // An oil field near each spawn, as far from it as the others, and two between them
                    oil0: { width: 2, height: 2, between: ["spawn0", "spawn1"], at: [0.2, 0.25], offset: [-0.1, 0.1] },
                    oil1: { width: 2, height: 2, between: ["spawn1", "spawn0"], at: [0.2, 0.25], offset: [-0.1, 0.1] },
                    oil2: { width: 2, height: 2, between: ["spawn2", "spawn3"], at: [0.2, 0.25], offset: [-0.1, 0.1] },
                    oil3: { width: 2, height: 2, between: ["spawn3", "spawn2"], at: [0.2, 0.25], offset: [-0.1, 0.1] },
                    oil4: { width: 2, height: 2, between: ["spawn0", "spawn1"], at: [0.4, 0.6], offset: [0.15, 0.3] },
                    oil5: { width: 2, height: 2, between: ["spawn0", "spawn1"], at: [0.4, 0.6], offset: [-0.3, -0.15] },
                },
                connect: [
                    ["spawn0", "spawn1"], ["spawn0", "spawn2"], ["spawn0", "spawn3"], ["spawn1", "spawn2"], ["spawn1", "spawn3"], ["spawn2", "spawn3"],
                    ["spawn0", "oil0"], ["spawn1", "oil1"], ["spawn2", "oil2"], ["spawn3", "oil3"], ["spawn0", "oil4"], ["spawn0", "oil5"],
                ],
            },

            /* Entities to be added: the oil fields */
            items: (sites) => Object.keys(sites)
                .filter((name) => name.startsWith("oil"))
                .map((name) => ({ type: "terrain", name: "oilfield", ...at(sites[name]), action: "hint" })),

            /* Entities for each starting team, placed at the team's spawn location */
            teamStartingItems: [
                { type: "buildings", name: "base", x: 0, y: 0 },
                { type: "vehicles", name: "harvester", x: 4, y: 0 },
                { type: "vehicles", name: "heavy-tank", x: 4, y: 2 },
                { type: "vehicles", name: "scout-tank", x: 6, y: 0 },
                { type: "vehicles", name: "scout-tank", x: 6, y: 2 },
            ],

            /* Conditional and Timed Trigger Events */
            triggers: () => [
                {
                    type: "conditional",
                    // Check if the player has lost all units and buildings
                    condition: (game) => !game.items.some((item) => item.team === game.team),
                    // Player has lost the game
                    action: (game) => {
                        game.endLevel(false);
                    },
                },
            ],
        },
    ],
});
