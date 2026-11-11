import { expect, playing, test } from "./fixtures.js";
import { licensedModelsHere } from "../scripts/licensed-models.js";

// Riding (core/mounts.js, world/mounts3d.js, characters/riding.js; docs/GAME.md *Riding*), played
// in a real browser: a horse bought from the home town's stablemaster, called with its whistle out
// of its ring of light, ridden, got down from, and struck down under its rider; the rider sat in
// its saddle, not standing through it. With the licensed models, Malbers Animations' horse and the
// rider's own clips; without them, the stand-ins.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

// Play on (the game stopped) for `seconds` of its time, a frame at a time, the page's events let
// in between, drawn now and then
const play = (page, seconds) =>
    page.evaluate(async (seconds) => {
        const { game } = window.pellagos;

        for (let k = 0; k < Math.round(seconds * 30); k++) {
            game.advance(1 / 30, { render: k % 15 === 14, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }, seconds);

// How the player's horse and its rider are drawn now: its phase (the battle's), whether it's drawn
// from its model and the rider from their clips, how far under the ground it is, how high the
// rider's hips and feet are over the ground they're over (and how high their hips are standing,
// as their body's made: `stands`), how far the balls of their feet are from where they go in the
// stirrups, how far the reins' ends are from where they're held, under the thumbs (riding.js
// pinchOf), and how far each hand's closed (its index finger's tip as far from the wrist as a
// share of how far it is with the hand open: `closed`, the more open of the two; metres; null,
// drawn without its model)
const ridden = (page) =>
    page.evaluate(async () => {
        const THREE = await import("three");
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const avatar = game.avatars.get(game.me);
        const one = game.mounts.horses.get(game.me);
        const height = (name) => avatar.character.rig.bone(name).getWorldPosition(new THREE.Vector3()).y;
        const ground = avatar.standing ?? avatar.object.position.y;
        const stirrups = game.mounts.stirrupsOf(game.me);
        const reins = game.mounts.reinsOf(game.me);
        const { STIRRUPS } = await import("/js/world/mounts3d.js");
        const { pinchOf } = await import("/js/characters/riding.js");
        const rig = avatar.character.rig;
        const tip = (name) => rig.bones[rig.index.get(name)].localToWorld(rig.tails[rig.index.get(name)].clone().sub(rig.heads[rig.index.get(name)]));
        const closed = (side) => tip(`${side}HandIndex3`).distanceTo(rig.bone(`${side}Hand`).getWorldPosition(new THREE.Vector3())) / rig.tails[rig.index.get(`${side}HandIndex3`)].distanceTo(rig.heads[rig.index.get(`${side}Hand`)]);

        avatar.object.updateMatrixWorld(true);
        const ball = (side) => avatar.character.rig.bone(`${side}ToeBase`).getWorldPosition(new THREE.Vector3()).lerp(avatar.character.rig.bone(`${side}Foot`).getWorldPosition(new THREE.Vector3()), STIRRUPS.ball);

        return {
            phase: me.mount?.phase ?? null,
            hp: me.mount?.hp ?? null,
            drawn: Boolean(one),
            model: one?.model ?? null,
            clips: Boolean(game.mounts.clips),
            under: one ? +(ground - one.beast.object.position.y).toFixed(2) : null,
            visible: one?.beast.object.visible ?? null,
            hips: +(height("Hips") - ground).toFixed(2),
            stands: +avatar.character.rig.heads[avatar.character.rig.index.get("Hips")].y.toFixed(2),
            feet: +(Math.min(height("LeftFoot"), height("RightFoot")) - ground).toFixed(2),
            posed: one?.beast.plan.posed?.map(({ clip, weight }) => [clip, +weight.toFixed(2)]) ?? [],
            bar: !document.querySelector("#playerplate .bar.mount").hidden,
            stirrups: stirrups ? Math.max(...["Left", "Right"].map((side) => +ball(side).distanceTo(stirrups[side]).toFixed(3))) : null,
            reins: reins ? Math.max(...["Left", "Right"].map((side) => +reins[side].distanceTo(pinchOf(rig, side)).toFixed(3))) : null,
            closed: Math.max(...["Left", "Right"].map((side) => +closed(side).toFixed(2))),
            stamina: [+me.stamina.toFixed(1), me.maxStamina],
            // (What the rider and the horse were doing, told when a check fails: how long into its
            // phase, whether the rider's posed from their clips or sat as on a bench, and where
            // the rider, the ground they're over and the horse are drawn)
            state: {
                since: me.mount ? game.battle.time - me.mount.at : null,
                quick: me.mount?.quick ?? null,
                riding: Boolean(avatar.actions.riding),
                seated: [avatar.actions.seated, one?.seated ?? null],
                every: avatar.every,
                heights: [avatar.object.position.y, avatar.standing ?? null, one?.beast.object.position.y ?? null].map((y) => (y === null ? null : +y.toFixed(3))),
                level: one?.beast.level ?? null,
                saddle: one?.saddle?.parent?.name ?? null,
                time: game.battle.time,
            },
        };
    });

test("buys a horse from the stablemaster, calls it up with its whistle, rides it at a trot, gets down, and has it brought back once it's fallen", async ({ page }) => {
    test.setTimeout(360000);
    await playing(page, "/?play&seed=2");
    // (Stopped: it's played on a frame at a time)
    await page.evaluate(() => window.pellagos.game.stop());

    // (The home town's stablemaster, out before its stable)
    const out = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const here = () => game.battle.actors.some(({ id }) => id.startsWith("stablemaster:"));

        for (let k = 0; k < 900 && !here(); k++) {
            game.advance(1 / 30, { render: false, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        return here();
    });

    expect(out).toBe(true);

    const bought = await page.evaluate(() => {
        const { game } = window.pellagos;
        const master = game.battle.actors.find(({ id }) => id.startsWith("stablemaster:"));

        game.host.players.get(game.me).progress.gold = 1000;
        game.battle.place(game.me, master.map, [master.square[0], master.square[1] + 2]);
        game.host.command(game.me, { type: "talk", with: master.id });

        const result = game.host.command(game.me, { type: "effect", effect: { stable: "buy" } });

        game.host.command(game.me, { type: "talk", with: null });

        const pack = game.host.players.get(game.me).progress.pack;

        return { result, gold: game.host.players.get(game.me).progress.gold, whistle: pack.find((stack) => stack?.id === "mountWhistle") ?? null };
    });

    expect(bought.result.ok).toBe(true);
    expect(bought.gold).toBe(600);
    expect(bought.whistle.horse.id).toBe(bought.result.horse.id);

    // Called, out in the street: rising out of the ground
    const called = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const index = game.host.players.get(game.me).progress.pack.findIndex((stack) => stack?.id === "mountWhistle");

        game.battle.place(game.me, "town", [me.square[0], me.square[1] + 3]);

        return game.host.command(game.me, { type: "use", index });
    });

    expect(called.ok).toBe(true);
    await play(page, 0.4);

    const rising = await ridden(page);

    expect(rising.phase).toBe("rising");
    expect(rising.drawn).toBe(true);
    expect(rising.under).toBeGreaterThan(0.3);
    expect(rising.bar).toBe(true);

    // Up in the saddle: sat on it, not standing through it (with the licensed models, once its
    // model and the rider's clips are read)
    await play(page, 4);

    if (licensedModelsHere()) {
        await page.evaluate(async () => {
            const { game } = window.pellagos;
            const start = performance.now();

            while (!(game.mounts.horses.get(game.me)?.model && game.mounts.clips) && performance.now() - start < 120000) {
                game.advance(1 / 30, { render: false, wait: true });
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        });
        await play(page, 0.5);
    }

    const sat = await ridden(page);

    expect(sat.phase, JSON.stringify(sat)).toBe("riding");
    expect(sat.under).toBeLessThan(0.05);
    expect(sat.hips, JSON.stringify(sat)).toBeGreaterThan(1.2);
    expect(sat.feet).toBeGreaterThan(0.4);

    if (licensedModelsHere()) {
        expect(sat.model).toBe(true);
        expect(sat.clips).toBe(true);
        // (Their feet in the stirrups, standing, and the reins in their hands, closed on them:
        // a loose fist, the index finger's tip brought back to about half its reach)
        expect(sat.stirrups, JSON.stringify(sat)).toBeLessThan(0.02);
        expect(sat.reins, JSON.stringify(sat)).toBeLessThan(0.02);
        expect(sat.closed, JSON.stringify(sat)).toBeLessThan(0.7);
    }

    // Off at a walk: carried at a trot, twice as fast and more as walking on foot, their feet in
    // the stirrups
    const going = (run, seconds) =>
        page.evaluate(
            async ([run, seconds]) => {
                const { game } = window.pellagos;
                const me = game.battle.actor(game.me);

                game.host.command(game.me, { type: "move", to: [me.square[0] + 60, me.square[1]], run });

                for (let k = 0; k < Math.round(seconds * 30); k++) {
                    game.advance(1 / 30, { render: false, wait: true });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }

                // (How fast, over its last second)
                const [x, y, time] = [me.x, me.y, game.battle.time];

                for (let k = 0; k < 30; k++) {
                    game.advance(1 / 30, { render: false, wait: true });
                    await new Promise((resolve) => setTimeout(resolve, 0));
                }

                // (And as fast as they'd walk, and run flat out, on foot)
                const { SPRINT } = await import("/js/core/battle.js");

                return { speed: Math.hypot(me.x - x, me.y - y) / ((game.battle.time - time) / 1000), walk: me.walkPace, run: me.speed * SPRINT, running: me.running };
            },
            [run, seconds],
        );
    const trot = await going(false, 1);
    const trotting = await ridden(page);

    expect(trotting.hips, JSON.stringify(trotting)).toBeGreaterThan(1.2);
    expect(trot.speed).toBeGreaterThan(2 * trot.walk);

    if (trotting.model) {
        expect(trotting.posed.some(([clip, weight]) => clip === "Trot" && weight > 0.5)).toBe(true);
        expect(trotting.stirrups, JSON.stringify(trotting)).toBeLessThan(0.02);
        expect(trotting.reins, JSON.stringify(trotting)).toBeLessThan(0.02);
        expect(trotting.closed, JSON.stringify(trotting)).toBeLessThan(0.7);
    }

    // Off at a run: carried at a gallop, far faster than they'd run on foot (core/battle.js
    // SPRINT), their stamina spent none of it, their feet in the stirrups still
    const before = (await ridden(page)).stamina;
    const gallop = await going(true, 2);
    const galloping = await ridden(page);

    expect(gallop.running).toBe(true);
    expect(gallop.speed).toBeGreaterThan(1.5 * gallop.run);
    expect(galloping.stamina[0]).toBeGreaterThanOrEqual(before[0]);
    expect(galloping.hips, JSON.stringify(galloping)).toBeGreaterThan(1.2);

    if (galloping.model) {
        expect(galloping.posed.some(([clip, weight]) => clip === "Sprint" && weight > 0.5)).toBe(true);
        expect(galloping.stirrups, JSON.stringify(galloping)).toBeLessThan(0.02);
        expect(galloping.reins, JSON.stringify(galloping)).toBeLessThan(0.02);
        expect(galloping.closed, JSON.stringify(galloping)).toBeLessThan(0.7);
    }

    // Down again with the whistle: it sinks away, and it's gone
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.command(game.me, { type: "stop" });
        game.host.command(game.me, { type: "use", item: "mountWhistle" });
    });
    await play(page, 4);

    const gone = await ridden(page);

    expect(gone.phase, JSON.stringify(gone)).toBe(null);
    expect(gone.drawn).toBe(false);
    // (On their own feet: their hips no more than a hand's breadth over where they stand as their
    // body's made, however tall they are; a tall hero's stand at 1.21 m and more, sat at 1.6)
    expect(gone.hips, JSON.stringify(gone)).toBeLessThan(gone.stands + 0.1);
    expect(gone.bar).toBe(false);

    // Its model let go of while none rides (beasts/model.js forgetModels: none drawn from it for
    // MODEL_LINGER, or at once by the memory guard), and called again: its model asked for again
    // and drawn from once it's read, not its stand-in from then on (an iPhone's party, 2026-11-11:
    // every horse a stand-in), and down again
    if (licensedModelsHere()) {
        const again = await page.evaluate(async () => {
            const { game } = window.pellagos;
            const { forgetModels, MODEL_LINGER, modelOf } = await import("./js/beasts/model.js");
            const { HORSE_MODEL } = await import("./js/core/mounts.js");
            const read = Boolean(modelOf(HORSE_MODEL));

            forgetModels(performance.now() + 2 * MODEL_LINGER);

            const forgotten = !modelOf(HORSE_MODEL);

            game.host.command(game.me, { type: "use", item: "mountWhistle" });

            const start = performance.now();

            while (!game.mounts.horses.get(game.me)?.model && performance.now() - start < 60000) {
                game.advance(1 / 30, { render: false, wait: true });
                await new Promise((resolve) => setTimeout(resolve, 20));
            }

            const one = game.mounts.horses.get(game.me);

            return { read, forgotten, model: one?.model ?? null, visible: one?.beast.object.visible ?? null, phase: game.battle.actor(game.me).mount?.phase ?? null };
        });

        expect(again.read).toBe(true);
        expect(again.forgotten).toBe(true);
        expect(again.model, JSON.stringify(again)).toBe(true);
        expect(again.visible).toBe(true);

        await play(page, 4);
        await page.evaluate(() => {
            const { game } = window.pellagos;

            game.host.command(game.me, { type: "use", item: "mountWhistle" });
        });
        await play(page, 4);
        expect((await ridden(page)).drawn).toBe(false);
    }

    // Called again and struck down under its rider: thrown, the horse fallen on its whistle, and
    // brought back at the stable
    const fell = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const index = game.host.players.get(game.me).progress.pack.findIndex((stack) => stack?.id === "mountWhistle");

        game.host.command(game.me, { type: "use", index });

        for (let k = 0; k < 120; k++) {
            game.advance(1 / 30, { render: false, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const me = game.battle.actor(game.me);
        const archer = game.battle.add({ id: "riding-archer", kind: "orc", weapon: "bow", team: "wild", square: [me.square[0], me.square[1]], hp: 500, armed: true });

        for (const [dx, dy] of [[0, 6], [6, 0], [-6, 0], [0, -6]]) {
            game.battle.place(archer.id, "town", [me.square[0] + dx, me.square[1] + dy]);

            if (game.battle.canSee(archer, me)) {
                break;
            }
        }

        me.mount.hp = 2;
        game.battle.command(archer.id, { type: "engage", target: me.id });

        for (let k = 0; k < 900 && me.mount?.phase !== "fallen"; k++) {
            game.advance(1 / 30, { render: false, wait: true });
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        const phase = me.mount?.phase ?? null;

        game.battle.remove(archer.id);

        return { phase, fallen: game.host.players.get(game.me).progress.pack[index].horse.fallen };
    });

    expect(fell.phase).toBe("fallen");
    expect(fell.fallen).toBe(true);
    await play(page, 6);

    const back = await page.evaluate(() => {
        const { game } = window.pellagos;
        const master = game.battle.actors.find(({ id }) => id.startsWith("stablemaster:"));

        game.battle.place(game.me, master.map, [master.square[0], master.square[1] + 2]);
        game.host.command(game.me, { type: "talk", with: master.id });

        const result = game.host.command(game.me, { type: "effect", effect: { stable: "revive" } });

        game.host.command(game.me, { type: "talk", with: null });

        return { ok: result.ok, fallen: game.host.players.get(game.me).progress.pack.find((stack) => stack?.id === "mountWhistle").horse.fallen };
    });

    expect(back).toEqual({ ok: true, fallen: false });
});
