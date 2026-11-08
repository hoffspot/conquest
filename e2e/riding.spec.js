import { expect, test } from "./fixtures.js";
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

// Open the game and wait for it to be playing
async function playing(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
}

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
// from its model and the rider from their clips, how far under the ground it is, and how high the
// rider's hips and feet are over the ground they're over (metres)
const ridden = (page) =>
    page.evaluate(async () => {
        const THREE = await import("three");
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const avatar = game.avatars.get(game.me);
        const one = game.mounts.horses.get(game.me);
        const height = (name) => avatar.character.rig.bone(name).getWorldPosition(new THREE.Vector3()).y;
        const ground = avatar.standing ?? avatar.object.position.y;

        return {
            phase: me.mount?.phase ?? null,
            hp: me.mount?.hp ?? null,
            drawn: Boolean(one),
            model: one?.model ?? null,
            clips: Boolean(game.mounts.clips),
            under: one ? +(ground - one.beast.object.position.y).toFixed(2) : null,
            visible: one?.beast.object.visible ?? null,
            hips: +(height("Hips") - ground).toFixed(2),
            feet: +(Math.min(height("LeftFoot"), height("RightFoot")) - ground).toFixed(2),
            posed: one?.beast.plan.posed?.map(({ clip, weight }) => [clip, +weight.toFixed(2)]) ?? [],
            bar: !document.querySelector("#playerplate .bar.mount").hidden,
        };
    });

test("buys a horse from the stablemaster, calls it up with its whistle, rides it at a trot, gets down, and has it brought back once it's fallen", async ({ page }) => {
    test.setTimeout(240000);
    await playing(page, "/?play&seed=2");

    // (The home town's stablemaster, out before its stable)
    await page.waitForFunction(() => window.pellagos.game.battle.actors.some(({ id }) => id.startsWith("stablemaster:")), null, { timeout: 30000 });

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

    // Up in the saddle: sat on it, not standing through it
    await page.waitForFunction(() => window.pellagos.game.battle.actor(window.pellagos.game.me).mount?.phase === "riding", null, { timeout: 60000, polling: 100 }).catch(() => null);
    await play(page, 4);

    const sat = await ridden(page);

    expect(sat.phase).toBe("riding");
    expect(sat.under).toBeLessThan(0.05);
    expect(sat.hips).toBeGreaterThan(1.2);
    expect(sat.feet).toBeGreaterThan(0.4);

    if (licensedModelsHere()) {
        expect(sat.model).toBe(true);
        expect(sat.clips).toBe(true);
    }

    // Off at a walk: carried at a trot
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.host.command(game.me, { type: "move", to: [me.square[0] + 20, me.square[1]] });
    });
    await play(page, 1.5);

    const trotting = await ridden(page);

    expect(trotting.hips).toBeGreaterThan(1.2);

    if (trotting.model) {
        expect(trotting.posed.some(([clip, weight]) => clip === "Trot" && weight > 0.5)).toBe(true);
    }

    // Down again with the whistle: it sinks away, and it's gone
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.command(game.me, { type: "stop" });
        game.host.command(game.me, { type: "use", item: "mountWhistle" });
    });
    await play(page, 4);

    const gone = await ridden(page);

    expect(gone.phase).toBe(null);
    expect(gone.drawn).toBe(false);
    expect(gone.hips).toBeLessThan(1.2);
    expect(gone.bar).toBe(false);

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
