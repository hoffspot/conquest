// The hells (docs/DUNGEONS.md *Hells*): four levels deep, each a realm of its own (themes.js hell's
// realms), gone down through portals each sealed till its level's own boss falls; the lord of the
// Pit before its hoard on the bottom level, and beyond its throne a portal out to the wilds, one
// way, sealed till the lord falls; never dealt to a wild dungeon's site, and met only at the
// highest tiers
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { STEP_MS } from "../client/js/core/battle.js";
import { CREATURES, RITES } from "../client/js/core/creatures.js";
import { buildDungeon, LEVEL_SIZES, MINIS } from "../client/js/core/dungeons/build.js";
import { CHAMPIONS, foeKey } from "../client/js/core/dungeons/play.js";
import { realmOf, themeFor, THEMES } from "../client/js/core/dungeons/themes.js";
import { hypot } from "../client/js/core/exact.js";
import { HOST_PLAYER, Host, REFUSALS } from "../client/js/core/host.js";
import { HELL_ORIGINS } from "../client/js/core/insides.js";
import { routeBetween } from "../client/js/core/interiors.js";
import { buildWorld } from "../client/js/core/overworld.js";
import { BIOMES } from "../client/js/core/worldplan/plan.js";

// (Textured materials paint a canvas: enough of one for them to in Node)
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }) }) };

const THREE = await import("three");
const { dungeonRooms } = await import("../client/js/core/insides.js");
const { readPlan } = await import("../client/js/core/interiors.js");
const { buildInterior, VEILS } = await import("../client/js/world/interiors3d.js");

const HERO = Object.freeze({ name: "Ada", shape: {}, look: {}, weapon: "sword", boots: false });
const HELL = THEMES.hell;
const SEEDS = [11, 12, 13, 14, 15, 16];

function run(host, ms, me = null) {
    const events = [];

    for (let t = 0; t < ms; t += STEP_MS) {
        if (me) {
            me.hp = me.maxHp;
        }

        events.push(...host.advance(STEP_MS));
    }

    return events;
}

const put = (actor, [x, y]) => Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, path: [], order: null, target: null });

// Through a way on: stood where one comes off it on this side, told to go through, and played on
// till they've crossed (or a minute's gone): whether they did, and whether the host would have it
function cross(host, me, link) {
    const end = link.ends.find(({ map }) => map === me.map);

    put(me, end.arrive);

    const told = host.command(HOST_PLAYER, { type: "enter", link: link.id });

    if (!told.ok) {
        return told;
    }

    for (let t = 0; t < 60000; t += 250) {
        if (run(host, 250, me).some(({ type, id }) => type === "cross" && id === HOST_PLAYER)) {
            return { ok: true };
        }
    }

    return { ok: false, reason: "never crossed" };
}

describe("a hell as it's made (dungeons/build.js, place.js, themes.js hell)", () => {
    const made = SEEDS.map((seed) => buildDungeon({ seed, theme: "hell", tier: 9 }));

    it("is four levels deep, each its realm's: dug, dressed, drawn and heard as its realm has it", () => {
        assert.equal(HELL.levels, 4);
        assert.equal(HELL.realms.length, 4);
        assert.ok(LEVEL_SIZES[4] && MINIS[4]);

        for (const dungeon of made) {
            assert.equal(dungeon.levels.length, 4);

            dungeon.levels.forEach((level, k) => {
                const realm = HELL.realms[k];
                const kinds = new Set(level.rooms.map(({ kind }) => kind));

                assert.deepEqual([level.realm, level.look, level.style, level.sound, level.ground], [realm.id, realm.look, realm.style, realm.sound, realm.ground]);

                // (Dug as its realm's layout digs, its rooms each dressed as its realm has them)
                for (const kind of kinds) {
                    assert.ok(realm.rooms[kind] ?? kind === "arena", `${realm.id}: a ${kind} it doesn't dress`);
                }

                for (const room of level.rooms) {
                    if (room.look) {
                        // (The room furthest in, by the portal down, dressed as its realm's own if
                        // it has one: the Breach's altar)
                        const looks = room.role === "stairs" && realm.rooms.goal ? realm.rooms.goal : realm.rooms[room.kind];

                        assert.ok(looks.some(({ id }) => id === room.look), `${realm.id}: ${room.look}`);
                    }
                }
            });
        }
    });

    it("is met only at the highest tiers, however low it's asked to be made", () => {
        for (const tier of [1, 5, 9, 10]) {
            const dungeon = buildDungeon({ seed: 11, theme: "hell", tier });

            assert.equal(dungeon.tier, Math.max(tier, HELL.tiers[0]));
            assert.ok(dungeon.levels.every((level) => level.tier >= HELL.tiers[0]));
        }
    });

    it("has a boss of its realm on every level guarding its way on: by the portal down, and on the bottom level in the last room before the arena; a boss of their own rank, no pack of the level's besides", () => {
        for (const dungeon of made) {
            dungeon.levels.forEach((level, k) => {
                const realm = HELL.realms[k];
                const wardens = level.packs.filter(({ role }) => role === "warden");

                assert.equal(wardens.length, 1, `level ${k + 1}`);

                const [pack] = wardens;
                const [boss, ...escorts] = pack.foes;

                assert.deepEqual([boss.creature, boss.warden, boss.title, boss.regalia], [realm.warden.creature, true, realm.warden.title, realm.warden.id]);
                assert.ok(escorts.length >= 1 && escorts.every(({ creature, warden }) => realm.warden.guard.includes(creature) && !warden));
                assert.ok(level.packs.every((other) => other === pack || other.room !== pack.room), "another pack in its room");

                if (k < 3) {
                    assert.equal(pack.room, level.path.at(-1), "in the room furthest in, by the way down");
                    assert.ok(level.down);
                } else {
                    const arena = level.path.at(-1);

                    assert.equal(level.path[level.path.indexOf(pack.room) + 1], arena, "in the room before the arena");
                }
            });
        }

        assert.ok(CHAMPIONS.floor.hp > CHAMPIONS.mini.hp && CHAMPIONS.floor.hp < CHAMPIONS.boss.hp);
    });

    it("draws its levels' packs and mini-bosses from their realms' own, whatever their tiers; the lord of the Pit at the bottom", () => {
        for (const dungeon of made) {
            dungeon.levels.forEach((level, k) => {
                const realm = HELL.realms[k];
                const kinds = new Set(realm.packs.flatMap(({ creatures }) => creatures));
                const minis = new Set(realm.minis.map(({ creature }) => creature));

                for (const pack of level.packs) {
                    for (const foe of pack.foes) {
                        if (pack.role === "pack") {
                            assert.ok(kinds.has(foe.creature), `${realm.id}: ${foe.creature}`);
                        } else if (foe.mini) {
                            assert.ok(minis.has(foe.creature), `${realm.id}: ${foe.creature}`);
                        }
                    }
                }
            });

            const bottom = dungeon.levels.at(-1);
            const lord = bottom.packs.find(({ role }) => role === "boss").foes[0];

            assert.deepEqual([lord.creature, lord.boss, lord.title], ["demonLord", true, "the Lord of the Pit"]);
            assert.ok(dungeon.levels.slice(0, -1).every((level) => !level.packs.some(({ role }) => role === "boss")));
        }

        // (The lord a creature of its own, met nowhere else)
        assert.deepEqual(CREATURES.demonLord.biomes, []);
        assert.deepEqual(CREATURES.demonLord.tiers, [10, 10]);
    });

    it("has its portal out on its bottom level beyond the throne: further in than its lord, every level still walked through whole", () => {
        for (const dungeon of made) {
            dungeon.levels.forEach((level, k) => {
                assert.equal(Boolean(level.exit), k === 3, `level ${k + 1}`);
            });

            const bottom = dungeon.levels.at(-1);
            const { exit } = bottom;
            const lord = bottom.packs.find(({ role }) => role === "boss").foes[0];
            const arena = bottom.rooms.find(({ role }) => role === "arena");
            const [ex, ey] = bottom.entry.arrive;
            const walk = (at) => hypot(at[0] - ex, at[1] - ey);

            // (Its landing in the arena, the lord between it and the way in)
            for (const [x, y] of exit.squares) {
                assert.equal(bottom.rows[y][x], ">");
                assert.ok(x >= arena.x && x < arena.x + arena.w && y >= arena.y && y < arena.y + arena.h);
            }

            assert.ok(walk(exit.squares[0]) > walk(lord.at), "the lord between the way in and the way out");
        }
    });

    it("floods the River of Fire's caverns and grottos with lava, wall to wall but for causeways across them; never the way in's room nor the one furthest in, where the Hellforge stands", () => {
        for (const dungeon of made) {
            const level = dungeon.levels[2];
            const at = (k) => level.rows[Math.floor(k / level.width)][k % level.width];
            const cells = (room) => {
                const list = [];

                for (let y = room.y; y < room.y + room.h; y++) {
                    for (let x = room.x; x < room.x + room.w; x++) {
                        list.push(y * level.width + x);
                    }
                }

                return list;
            };
            const lava = [...level.rows.join("")].filter((c) => c === "~").length;
            const open = [...level.rows.join("")].filter((c) => c !== "#").length;

            assert.ok(lava / open > 0.15 && lava / open < 0.5, `${((lava / open) * 100).toFixed(0)}% lava`);

            const entry = level.rooms.find(({ role }) => role === "entry");
            const goal = level.rooms.find(({ role }) => role === "stairs");

            assert.ok(!cells(entry).some((k) => at(k) === "~"), "none in the way in's room");
            assert.equal(goal.look, "hellforge");
            assert.ok(cells(goal).some((k) => at(k) === "F"), "the Hellforge");

            // (None on the Halls of Bone: the Breach's lava only in its pools, the Pit's only a rim
            // along its throne hall's walls, test/pit.test.js)
            assert.ok(!dungeon.levels[1].rows.join("").includes("~"));
        }
    });

    it("is never dealt to a wild dungeon's site, whatever the land", () => {
        assert.equal(HELL.wild, false);

        for (const { id: land } of BIOMES) {
            for (let seed = 1; seed <= 300; seed++) {
                assert.notEqual(themeFor(seed, land), "hell");
            }
        }
    });

    it("is each level its realm's, as a theme (realmOf); another theme its own on every level", () => {
        assert.equal(realmOf(HELL, 2).look, "hell-fire");
        assert.equal(realmOf(HELL, 3).hoard, "head");
        assert.equal(realmOf(HELL, 9).realm, "pit");
        assert.equal(realmOf(THEMES.caves, 1), THEMES.caves);

        // (And as a whole, all its realms' packs and mini-bosses, its levels' bosses among them)
        for (const realm of HELL.realms) {
            assert.ok(realm.packs.every(({ creatures }) => creatures.every((creature) => HELL.packs.some((pack) => pack.creatures.includes(creature)))));
            assert.ok(HELL.minis.some(({ id }) => id === realm.warden.id));
        }
    });
});

describe("a hell's levels as they're drawn (world/interiors3d.js riftPortal, breachRift, VEILS; lava.js; flesh.js)", () => {
    it("has a portal of fire where other dungeons have stairs: an arch on each way up or down (and out), its veil in a hell's colours, lighting the room red; the guild's portals as they were", () => {
        const floors = dungeonRooms({ seed: 11, theme: "hell", tier: 9 });
        // (How many points one portal's veil has: those drawn alike are drawn as one)
        let each = null;

        floors.forEach((floor, k) => {
            const map = readPlan(`test-hell-${k}`, floor.name, floor.rows, { ground: floor.ground });

            Object.assign(map, { origin: [0, 0], style: floor.style, look: floor.look, people: "human", dungeon: { theme: floor.look, level: k, levels: floors.length, lights: floor.level.lights, rooms: floor.level.rooms, lurks: [], portals: true } });

            const built = buildInterior(map);
            const veils = [];
            const rifts = [];

            built.object.traverse((node) => node.isMesh && node.material.userData?.veil === "hell" && (node.material.name.startsWith("rift-veil") ? rifts : veils).push(node));

            // (One for the way up, below the first level; one for the way down, or on the bottom
            // level the way out: each lighting the room)
            const portals = k === 0 ? 1 : 2;
            const points = veils.reduce((sum, veil) => sum + veil.geometry.attributes.position.count, 0);

            each ??= points;
            assert.ok(veils.length >= 1);
            assert.equal(points, portals * each, `${floor.look}: ${points / each} veils`);
            assert.equal(built.lights.filter(({ kind }) => kind === "portal-hell").length, portals);
            assert.equal(map.look, HELL.realms[k].look);

            // (The Breach's rift over its altar, a hell's swirl in it, two faces back to back, lit
            // by its own light; on no other level)
            assert.equal(rifts.length, k === 0 ? 1 : 0, floor.look);
            assert.equal(built.lights.filter(({ kind }) => kind === "rift").length, k === 0 ? 1 : 0);

            // (The Breach's pools of lava, every one in one mesh and their banks in another, each
            // pool its light, and the Pit's rim drawn as they are; the Breach's rock and floor
            // glowing by them, embers in its cracks; the River of Fire's lava its lakes)
            const named = (name) => {
                const found = [];

                built.object.traverse((node) => node.isMesh && node.name === name && found.push(node));

                return found;
            };
            const pools = map.pieces.filter(({ kind }) => kind === "lava").length;

            assert.equal(pools > 0, k !== 1, `${floor.look}: ${pools} pools`);
            assert.equal(named("lava").length, k === 0 || k === 3 ? 1 : 0);
            assert.equal(named("lava-bank").length, k === 0 || k === 3 ? 1 : 0);

            if (k !== 2) {
                assert.equal(built.lights.filter(({ kind }) => kind === "lava").length, pools);
            }

            // (The Halls of Bone's: their walls of flesh, veins beating in them, ribs rising out of
            // them, blood pooled on the floor, and the heart in the last room, beating, its light
            // with it)
            assert.equal(named("ribs").length > 0, k === 1);
            assert.equal(named("blood").length, k === 1 ? 1 : 0);
            assert.equal(named("heart").length, k === 1 ? 1 : 0);
            assert.equal(built.lights.filter(({ kind }) => kind === "heart").length, k === 1 ? 1 : 0);

            // (The River of Fire's: its lakes of lava, every one in one mesh, the floor sinking into
            // them, embers in its rock, their lights; and the Hellforge, its basin and its mouth
            // molten, its fire's light)
            assert.equal(named("lava-lakes").length, k === 2 ? 1 : 0);

            // (The Pit's: its sigils inlaid in its floor, every one in one mesh, and the lord's
            // throne, his light over it)
            assert.equal(named("sigils").length, k === 3 ? 1 : 0);
            assert.equal(built.lights.filter(({ kind }) => kind === "lord").length, k === 3 ? 1 : 0);
            assert.equal(named("forge-basin").length, k === 2 ? 1 : 0);
            assert.equal(named("forge-mouth").length, k === 2 ? 1 : 0);

            // (Where the Halls' heart beats and the River's Hellforge stands, each heard from there:
            // audio/ambience.js)
            const middleOf = (kind) => map.pieces.filter((piece) => piece.kind === kind).map(({ x, y, w, h }) => ({ x: x + w / 2, z: y + h / 2 }))[0] ?? null;

            assert.deepEqual([built.heart, built.forge], [middleOf("heart"), middleOf("forge")]);
            assert.deepEqual([Boolean(built.heart), Boolean(built.forge)], [k === 1, k === 2]);

            if (k === 2) {
                const floorYs = named("floor").flatMap((mesh) => [...mesh.geometry.attributes.position.array].filter((_, j) => j % 3 === 1));

                assert.ok(Math.min(...floorYs) < -0.3, "the floor sinking under the lava");
                assert.ok(named("rock").every((mesh) => mesh.geometry.attributes.seam), "embers in the rock");
                assert.ok(built.lights.filter(({ kind }) => kind === "lava").length >= 2);
            }

            if (k === 1) {
                assert.ok(named("rock").every((mesh) => mesh.geometry.attributes.seam && mesh.material.roughness < 0.9), "veins in wet flesh");
                assert.ok(map.pieces.some(({ kind }) => kind === "blood") && map.pieces.some(({ kind }) => kind === "heart"));
            }

            if (k === 0) {
                const rock = named("rock");

                assert.ok(rock.length > 0 && rock.every((mesh) => mesh.geometry.attributes.seam && mesh.geometry.attributes.glow), "embers and glow in the rock");
                assert.ok(named("floor").every((mesh) => mesh.geometry.attributes.glow && !mesh.geometry.attributes.seam), "the floor glowing by the pools");
                assert.ok(rock.some((mesh) => mesh.geometry.attributes.glow.array.some((byte) => byte > 0)));
            }

            // (Its veil's colours a hell's in the shader it's drawn with)
            const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };

            veils[0].material.onBeforeCompile(shader);
            assert.match(veils[0].material.customProgramCacheKey(), /-veil-hell$/);
            assert.ok(shader.fragmentShader.includes(`vec3 middle = vec3(${VEILS.hell.middle.map((c) => c.toFixed(3)).join(", ")});`));
            built.dispose();
        });

        assert.ok(VEILS.hell.middle[0] > VEILS.hell.middle[2] && VEILS.guild.middle[2] > VEILS.guild.middle[0], "red, and the guild's blue");
    });
});

// The war's clock set to a time of day: by day (the morning, as a new world starts) or by night
// (an hour of the war's turns a day: a little past sunset, dark), a day or more on from where it is
const at = (host, when) => {
    host.war.turn = Math.ceil(host.war.turn / 60) * 60 + (when === "night" ? 34 : 60);
    host.war.clock = 0;
};

describe("a hell gone down (insides.js, host.js enter, #riteFell, #delveFell)", () => {
    let world;
    let host;
    let me;
    let site;
    let building;

    before(() => {
        world = buildWorld({ seed: 1 });
        host = new Host(world, { populate: false });
        host.join({ id: HOST_PLAYER, hero: HERO });
        host.populate();
        Object.assign(host.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        me = host.battle.actor(HOST_PLAYER);
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });

        // (The nearest hell's way in to where the player starts, by day: its cult's camp in the
        // wilds, worldplan/settle.js HELLS)
        const [sx, sy] = world.start.at;

        site = world.plan.sites.filter(({ theme }) => theme === "hell").sort((a, b) => hypot(a.at[0] - sx, a.at[1] - sy) - hypot(b.at[0] - sx, b.at[1] - sy))[0];
        world.maps.town.sites.heartOf(site);
        building = world.interiors.buildings.get(`site:${site.id}`);
        at(host, "day");
        put(me, world.maps.town.sites.set.get(site.id).entrance.outside);
        run(host, 1500, me);
    });

    it("won't let anyone in by day, nor by night while its cult keeps its rite there; once the last of them falls, lets them in till daybreak", () => {
        assert.equal(building.theme, "hell");

        // (By day: the cult's not there, the portal cold)
        assert.equal(cross(host, me, building.door).reason, "riteDay");
        assert.ok(!host.lairs.has(site.id), "no rite by day");

        // (By night: its high priest and its faithful round its heart, at the hell's tiers)
        at(host, "night");
        run(host, 1500, me);

        const held = host.lairs.get(site.id);
        const keepers = held.ids.map((id) => host.wild.get(id));
        const [master, tier] = RITES.hell.master;

        assert.deepEqual(keepers.filter((one) => one.master).map((one) => [one.creature, one.tier]), [[master, tier]]);
        assert.ok(keepers.filter((one) => !one.master).every((one) => one.creature === "cultist" && one.tier >= 9));
        assert.ok(keepers.length >= 1 + RITES.hell.guards.reduce((sum, [, count]) => sum + count, 0));
        assert.equal(cross(host, me, building.door).reason, "rite");

        // (All but one slain: still held)
        const [last, ...rest] = held.ids;

        for (const id of rest) {
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        }

        run(host, 2000, me);
        assert.equal(cross(host, me, building.door).reason, "rite");

        // (The last: broken, said, and in)
        host.battle.afflict(last, "poison", { by: HOST_PLAYER, damage: 1e7 });

        const events = run(host, 2000, me);

        assert.ok(events.some(({ type, change, site: where }) => type === "dungeon" && change === "rite" && where === site.id));
        assert.ok(cross(host, me, building.door).ok);
        assert.equal(me.map, building.maps[0]);
    });

    it("draws its four levels in a block of their own, each named for its realm, its ways down portals each sealed by its level's boss, and from beyond its throne a way out to the wilds, sealed by its lord", () => {
        assert.ok(building.made);
        assert.equal(building.maps.length, 4);

        building.maps.forEach((id, k) => {
            const map = world.maps[id];

            assert.ok(map.origin[0] >= HELL_ORIGINS.x);
            assert.equal(map.look, HELL.realms[k].look);
            assert.equal(map.dungeon.portals, true);
            assert.ok(map.name.endsWith(HELL.realms[k].name), map.name);
        });

        const downs = building.flights.filter(({ id }) => id.endsWith("/stairs"));
        const [out] = building.flights.filter(({ id }) => id.endsWith("/exit"));

        assert.equal(downs.length, 3);
        downs.forEach((flight, k) => {
            assert.deepEqual(flight.seal, { map: building.maps[k], level: k, pack: `${k}-warden`, refusal: "sealed" });
        });

        // (Out to before its way in, nothing outside to go in by)
        assert.equal(out.seal.map, building.maps[3]);
        assert.equal(out.seal.refusal, "throne");
        assert.equal(out.ends[0].map, "town");
        assert.deepEqual(out.ends[0].squares, []);
        assert.deepEqual(out.ends[0].arrive, building.door.ends[0].arrive);
        assert.ok(REFUSALS.sealed && REFUSALS.throne);

        // (Never a way anyone's led in by: routeBetween)
        assert.ok(!(routeBetween(world.links, "town", building.maps[3]) ?? []).includes(out));
    });

    it("won't let anyone down a portal till its level's boss falls, then does; nor in by the way out", () => {
        assert.equal(host.command(HOST_PLAYER, { type: "enter", link: building.flights.find(({ id }) => id.endsWith("/exit")).id }).ok, false);

        for (let k = 0; k < 3; k++) {
            const flight = building.flights[k];
            const told = cross(host, me, flight);

            assert.equal(told.reason, "sealed", `level ${k + 1} unsealed before its boss fell`);

            const [id, warden] = [...host.wild].find(([each, one]) => one.dungeon === site.id && one.champion === "floor" && host.battle.actor(each)?.map === building.maps[k]);

            assert.equal(warden.foe, foeKey(k, `${k}-warden`, 0));
            host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });

            const events = run(host, 2000, me);

            assert.ok(events.some(({ type, change, site: where }) => type === "dungeon" && change === "floor" && where === site.id));
            assert.ok(cross(host, me, flight).ok, `down to level ${k + 2}`);
            run(host, 1000, me);
            assert.equal(me.map, building.maps[k + 1]);
        }

        // (And back up, whenever)
        assert.ok(cross(host, me, building.flights[2]).ok);
        assert.equal(me.map, building.maps[2]);
        assert.ok(cross(host, me, building.flights[2]).ok);
        assert.equal(me.map, building.maps[3]);
    });

    it("won't let anyone out beyond the throne till its lord falls, then brings them out before its way in", () => {
        const out = building.flights.find(({ id }) => id.endsWith("/exit"));

        assert.equal(cross(host, me, out).reason, "throne");

        const [id] = [...host.wild].find(([, one]) => one.dungeon === site.id && one.champion === "boss");

        host.battle.afflict(id, "poison", { by: HOST_PLAYER, damage: 1e7 });
        run(host, 2000, me);

        assert.ok(cross(host, me, out).ok);
        assert.equal(me.map, "town");
        assert.ok(hypot(me.x - (out.ends[0].arrive[0] + 0.5), me.y - (out.ends[0].arrive[1] + 0.5)) < 3);
    });

    it("keeps its rite again the next night, its way in shut again till the cult's slain; by day, none", () => {
        at(host, "day");
        run(host, 1500, me);
        assert.ok(!host.lairs.get(site.id)?.ids.some((id) => !host.battle.actor(id)?.dead), "none of the cult about by day");
        assert.equal(cross(host, me, building.door).reason, "riteDay");

        at(host, "night");
        run(host, 1500, me);
        assert.ok(host.lairs.get(site.id).ids.some((id) => host.wild.get(id)?.master && !host.battle.actor(id).dead), "its high priest back at it");
        assert.equal(cross(host, me, building.door).reason, "rite");
    });
});
