// The levels played in the game.
//
// Level data is plain JSON-like data, except for triggers: each trigger's condition() and
// action() receive the running Game instance as their only argument.
//
// Trigger types:
//   { type: "timed", time: ms, repeat?: boolean, action(game) }  - runs after `time` ms of game time
//   { type: "conditional", condition(game), action(game) }        - checked every second, runs once
//
// Times are measured in game time, so triggers pause along with the game.

// Build an order for a starport to construct a unit that goes hunting as soon as it arrives
const constructHunter = (type, name) => ({ type: "construct-unit", details: { type, name, orders: { type: "hunt" } } });

export const levels = Object.freeze({
    singleplayer: [
        {
            name: "Rescue",
            briefing: "In the months since the great war, mankind has fallen into chaos. Billions are dead with cities in ruins.\nSmall groups of survivors band together to try and survive as best as they can.\nWe are trying to reach out to all the survivors in this sector before we join back with the main colony.",

            /* Map Details */
            mapName: "plains",
            startX: 36,
            startY: 0,

            /* Entities to be loaded */
            requirements: {
                buildings: ["base"],
                vehicles: ["transport", "scout-tank", "heavy-tank"],
                aircraft: [],
                terrain: [],
            },

            /* Entities to be added */
            items: [
                /* Slightly damaged base */
                { type: "buildings", name: "base", x: 55, y: 6, team: "blue", life: 100 },

                /* Our hero tank */
                { type: "vehicles", name: "heavy-tank", uid: -1, x: 57, y: 12, direction: 4, team: "blue" },

                /* Two transport vehicles waiting just to be rescued just outside the visible map */
                { type: "vehicles", name: "transport", uid: -3, selectable: false, x: -3, y: 2, direction: 2, team: "blue" },
                { type: "vehicles", name: "transport", uid: -4, selectable: false, x: -3, y: 4, direction: 2, team: "blue" },

                /* Two damaged enemy scout-tanks patrolling the area */
                { type: "vehicles", name: "scout-tank", uid: -2, x: 40, y: 20, direction: 4, team: "green", life: 20, orders: { type: "patrol", from: { x: 34, y: 20 }, to: { x: 42, y: 25 } } },
                { type: "vehicles", name: "scout-tank", uid: -5, x: 14, y: 0, direction: 4, team: "green", life: 20, orders: { type: "patrol", from: { x: 14, y: 0 }, to: { x: 14, y: 14 } } },
            ],

            cash: {
                blue: 0,
                green: 0,
            },

            /* Conditional and Timed Trigger Events */
            triggers: [
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
                        game.showMessage("op", "They were last seen in the North West Sector. Could you investigate?");
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
                    // Check if hero has reached the top left quadrant of the map
                    condition: (game) => {
                        const hero = game.getItemByUid(-1);

                        return hero && hero.x < 30 && hero.y < 30;
                    },
                    // Display distress call from the driver
                    action: (game) => {
                        game.showMessage("driver", "Can anyone hear us? Our convoy has been pinned down by rebel tanks. We need help.");
                    },
                },
                {
                    type: "conditional",
                    // Check if player is near convoy location
                    condition: (game) => {
                        const hero = game.getItemByUid(-1);

                        return hero && hero.x < 10 && hero.y < 10;
                    },
                    // Show thank you message from driver and tell convoy to follow hero
                    action: (game) => {
                        game.showMessage("driver", "Thank you. We thought we would never get out of here alive.");
                        game.sendCommand([-3, -4], { type: "guard", toUid: -1 });
                    },
                },
                {
                    type: "conditional",
                    // Check if convoy vehicles are near the base
                    condition: (game) => {
                        const transport1 = game.getItemByUid(-3);
                        const transport2 = game.getItemByUid(-4);

                        return transport1 && transport2 && transport1.x > 52 && transport2.x > 52 && transport2.y < 18 && transport1.y < 18;
                    },
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

            /* Map Details */
            mapName: "plains",
            startX: 36,
            startY: 0,

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

            /* Entities to be added */
            items: [
                { type: "buildings", name: "base", uid: -1, x: 55, y: 6, team: "blue" },

                { type: "buildings", name: "ground-turret", x: 53, y: 17, team: "blue" },
                { type: "vehicles", name: "heavy-tank", uid: -2, x: 55, y: 16, direction: 4, team: "blue", orders: { type: "sentry" } },

                /* The first wave of attacks */
                { type: "vehicles", name: "scout-tank", x: 55, y: 36, direction: 4, team: "green", orders: { type: "hunt" } },
                { type: "vehicles", name: "scout-tank", x: 53, y: 36, direction: 4, team: "green", orders: { type: "hunt" } },

                /* Enemies patrolling the area */
                { type: "vehicles", name: "scout-tank", x: 5, y: 5, direction: 4, team: "green", orders: { type: "patrol", from: { x: 5, y: 5 }, to: { x: 20, y: 20 } } },
                { type: "vehicles", name: "scout-tank", x: 5, y: 15, direction: 4, team: "green", orders: { type: "patrol", from: { x: 5, y: 15 }, to: { x: 20, y: 30 } } },
                { type: "vehicles", name: "scout-tank", x: 25, y: 5, direction: 4, team: "green", orders: { type: "patrol", from: { x: 25, y: 5 }, to: { x: 25, y: 20 } } },
                { type: "vehicles", name: "scout-tank", x: 35, y: 5, direction: 4, team: "green", orders: { type: "patrol", from: { x: 35, y: 5 }, to: { x: 35, y: 30 } } },

                /* The Evil Rebel Base */
                { type: "buildings", name: "base", uid: -11, x: 5, y: 36, team: "green" },
                { type: "buildings", name: "starport", uid: -12, x: 1, y: 30, team: "green" },
                { type: "buildings", name: "starport", uid: -13, x: 4, y: 32, team: "green" },

                { type: "buildings", name: "harvester", x: 1, y: 38, team: "green", action: "deploy" },
                { type: "buildings", name: "ground-turret", x: 5, y: 28, team: "green" },
                { type: "buildings", name: "ground-turret", x: 7, y: 33, team: "green" },
                { type: "buildings", name: "ground-turret", x: 8, y: 37, team: "green" },
            ],

            /* Conditional and Timed Trigger Events */
            triggers: [
                {
                    type: "timed", time: 8000,
                    // Send in reinforcements to guard the hero tank from the first enemy wave
                    action: (game) => {
                        game.showMessage("op", "Commander!! Reinforcements have arrived from the colony.");

                        const hero = game.getItemByUid(-2);
                        const orders = hero ? { type: "guard", to: hero } : { type: "sentry" };

                        game.add({ type: "vehicles", name: "scout-tank", team: "blue", x: 61, y: 22, orders });
                        game.add({ type: "vehicles", name: "scout-tank", team: "blue", x: 61, y: 21, orders });
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
                        game.add({ type: "vehicles", name: "scout-tank", team: "blue", x: 61, y: 22, orders: { type: "move", to: { x: 55, y: 21 } } });
                        game.add({ type: "vehicles", name: "heavy-tank", team: "blue", x: 61, y: 23, orders: { type: "move", to: { x: 56, y: 23 } } });
                    },
                },
                {
                    type: "timed", time: 600000,
                    // Send in air support if the mission hasn't finished after 10 minutes
                    action: (game) => {
                        game.showMessage("pilot", "Close Air Support en route. Will try to do whatever I can to help.");
                        game.add({ type: "aircraft", name: "chopper", team: "blue", selectable: false, x: 61, y: 22, orders: { type: "hunt" } });
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
            ],
        },

        {
            name: "Under Siege",
            briefing: "Thanks to the attack led by you, we now have control of the rebel base. We can expect the rebels to try to retaliate.\nThe colony is sending in aircraft to help us evacuate back to the main camp. All we need to do is hang tight until the choppers get here.\nLuckily, we have some supplies and ammunition to defend ourselves with until they get here.\nProtect the transports at all costs.",

            /* Map Details */
            mapName: "plains",
            startX: 0,
            startY: 20,

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

            /* Entities to be added */
            items: [
                /* The Rebel Base, which is now in our hands */
                { type: "buildings", name: "base", uid: -11, x: 5, y: 36, team: "blue" },
                { type: "buildings", name: "starport", uid: -12, x: 1, y: 28, team: "blue" },
                { type: "buildings", name: "starport", uid: -13, x: 4, y: 32, team: "blue" },
                { type: "buildings", name: "harvester", x: 1, y: 38, team: "blue", action: "deploy" },
                { type: "buildings", name: "ground-turret", x: 7, y: 28, team: "blue" },
                { type: "buildings", name: "ground-turret", x: 8, y: 32, team: "blue" },
                { type: "buildings", name: "ground-turret", x: 11, y: 37, team: "blue" },

                /* The transports that need to be protected */
                { type: "vehicles", name: "transport", uid: -1, x: 2, y: 33, team: "blue", direction: 2, selectable: false },
                { type: "vehicles", name: "transport", uid: -2, x: 1, y: 34, team: "blue", direction: 2, selectable: false },
                { type: "vehicles", name: "transport", uid: -3, x: 2, y: 35, team: "blue", direction: 2, selectable: false },
                { type: "vehicles", name: "transport", uid: -4, x: 1, y: 36, team: "blue", direction: 2, selectable: false },

                /* The chopper pilot from the last mission */
                { type: "aircraft", name: "chopper", x: 15, y: 40, team: "blue", selectable: false, uid: -5, orders: { type: "patrol", from: { x: 15, y: 40 }, to: { x: 0, y: 25 } } },

                /* The first wave of attacks */
                { type: "vehicles", name: "scout-tank", x: 15, y: 16, direction: 4, team: "green", orders: { type: "hunt" } },
                { type: "vehicles", name: "scout-tank", x: 17, y: 16, direction: 4, team: "green", orders: { type: "hunt" } },

                /* Secret Rebel bases */
                { type: "buildings", name: "starport", uid: -23, x: 35, y: 37, team: "green" },
                { type: "buildings", name: "starport", uid: -24, x: 33, y: 37, team: "green" },
                { type: "buildings", name: "harvester", x: 28, y: 39, team: "green", action: "deploy" },
                { type: "buildings", name: "harvester", x: 30, y: 39, team: "green", action: "deploy" },

                { type: "buildings", name: "starport", uid: -21, x: 3, y: 0, team: "green" },
                { type: "buildings", name: "starport", uid: -22, x: 6, y: 0, team: "green" },
                { type: "buildings", name: "harvester", x: 0, y: 2, team: "green", action: "deploy" },
                { type: "buildings", name: "harvester", x: 0, y: 4, team: "green", action: "deploy" },
            ],

            /* Conditional and Timed Trigger Events */
            triggers: [
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
                    // Add a new transport to the top right of the map
                    action: (game) => {
                        game.add({ type: "vehicles", name: "transport", x: 57, y: 3, team: "blue", direction: 4, selectable: false, uid: -6 });
                        game.showMessage("driver", "Commander!! The colony has sent some extra supplies. We are coming in from the North East sector through rebel territory. We could use a little protection.");
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
                        game.add({ type: "vehicles", name: "scout-tank", x: 57, y: 28, team: "green", orders: { type: "hunt" } });
                        game.add({ type: "aircraft", name: "wraith", x: 55, y: 33, team: "green", orders: { type: "sentry" } });
                        game.add({ type: "aircraft", name: "wraith", x: 53, y: 33, team: "green", orders: { type: "sentry" } });
                        game.add({ type: "vehicles", name: "scout-tank", x: 35, y: 25, life: 20, direction: 4, team: "green", orders: { type: "patrol", from: { x: 35, y: 25 }, to: { x: 35, y: 30 } } });
                    },
                },
                {
                    type: "timed", time: 48000,
                    // Start moving the transport towards the base
                    action: (game) => {
                        game.showMessage("driver", "Thanks! Appreciate the backup. All right. Off we go.");
                        game.sendCommand([-6], { type: "move", to: { x: 0, y: 32 } });
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
                    condition: (game) => {
                        const driver = game.getItemByUid(-6);

                        return driver && driver.x < 2 && driver.y > 30;
                    },
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
                    // After 10 minutes send in reinforcements
                    action: (game) => {
                        game.showMessage("op", "Commander!! The colony air fleet is approaching");

                        for (let y = 28; y <= 39; y++) {
                            const name = y % 2 === 0 ? "wraith" : "chopper";

                            game.add({ type: "aircraft", name, x: -1, y, team: "blue", orders: { type: "hunt" } });
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
            /* Map Details */
            mapName: "plains",

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

            /* Entities to be added */
            items: [
                { type: "terrain", name: "oilfield", x: 16, y: 4, action: "hint" },
                { type: "terrain", name: "oilfield", x: 34, y: 12, action: "hint" },
                { type: "terrain", name: "oilfield", x: 1, y: 30, action: "hint" },
                { type: "terrain", name: "oilfield", x: 38, y: 38, action: "hint" },
            ],

            /* Entities for each starting team */
            teamStartingItems: [
                { type: "buildings", name: "base", x: 0, y: 0 },
                { type: "vehicles", name: "harvester", x: 4, y: 0 },
                { type: "vehicles", name: "heavy-tank", x: 4, y: 2 },
                { type: "vehicles", name: "scout-tank", x: 6, y: 0 },
                { type: "vehicles", name: "scout-tank", x: 6, y: 2 },
            ],

            /* Possible starting spawn locations for the players */
            spawnLocations: [
                { x: 48, y: 36, startX: 36, startY: 20 },
                { x: 3, y: 36, startX: 0, startY: 20 },
                { x: 36, y: 3, startX: 32, startY: 0 },
                { x: 3, y: 3, startX: 0, startY: 0 },
            ],

            /* Conditional and Timed Trigger Events */
            triggers: [
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
