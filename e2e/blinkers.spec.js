// Blinkers (client/js/core/blinkers.js; generated/multiplayer_scaling_plan.md 3-9): a lockstep
// game that knows no one further off its hero than 192 m, or on another map, as a replicated
// world's game will be told only of what's near. Played alone and joined to another's world, it
// does all it does with those hidden: nothing it's told of them (the world's own events: a
// far fight, a town's muster, the war's turn) is a page's error.
import { expect, playing, test } from "./fixtures.js";

test.setTimeout(480000);
test.describe.configure({ mode: "default" });

// What the game knows of its battle, and whether anyone in it is past its blinkers
const known = (page) =>
    page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);
        const whole = game.host.battle;
        const near = (actor) => actor === me || (actor.map === me.map && Math.hypot(actor.x - me.x, actor.y - me.y) <= game.battle.blinkers);

        // (And what the game caught of its own and kept in its debug log: app/telemetry.js)
        const caught = (JSON.parse(window.pellagos.telemetry.text()).events ?? []).filter(({ kind }) => kind === "error").map(({ summary }) => summary);

        return { caught, radius: game.battle.blinkers, all: whole.actors.length, known: game.battle.actors.length, astray: game.battle.actors.filter((actor) => !near(actor)).length, hidden: whole.actors.filter((actor) => !near(actor)).length };
    });

test("a game alone, through blinkers: the world played on about it, its hero carried far off and gone indoors, those far off felled and fought over, and nothing a page's error", async ({ page }) => {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    await playing(page, "/?play&seed=1&blinkers");

    const first = await known(page);

    expect(first.radius).toBe(192);
    expect(first.astray).toBe(0);
    expect(first.hidden).toBeGreaterThan(0);
    expect(first.known).toBe(first.all - first.hidden);

    // The world played on a while as it's drawn, then two minutes of it by hand: its folk's
    // days, its patrols and whatever the wilds deal, most of it out of the hero's knowing
    await page.waitForTimeout(3000);

    const played = await page.evaluate(async () => {
        const { game } = window.pellagos;
        const whole = game.host.battle;
        const me = whole.actor(game.me);
        const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
        const on = async (seconds) => {
            for (let t = 0; t < seconds; t += 0.5) {
                me.hp = me.maxHp;
                game.advance(0.5, { render: t % 5 === 0 });
                await turn();
            }
        };

        game.stop();
        Object.assign(me, { hp: 1e6, maxHp: 1e6 });
        await on(60);

        // Those far off felled, and set on one another: what's told of it is of no one known
        const far = whole.actors.filter((actor) => actor !== me && !actor.dead && actor.map === me.map && Math.hypot(actor.x - me.x, actor.y - me.y) > game.battle.blinkers + 50);

        for (const actor of far.slice(0, 12)) {
            whole.afflict(actor.id, "poison", { by: far.at(-1).id, damage: 1e7 });
        }

        await on(20);

        // Carried 600 m off at a stroke: everyone known till now gone from knowing, others come
        const [x, y] = [me.x, me.y];

        game.host.battle.place(game.me, me.map, [Math.floor(x) + 600, Math.floor(y)]) || Object.assign(me, { x: x + 600, square: [Math.floor(x) + 600, Math.floor(y)] });
        await on(20);
        whole.place(game.me, me.map, [Math.floor(x), Math.floor(y)]);
        await on(10);

        // Indoors, in the guild: everyone out of doors unknown, and the world going on out there
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const [dx, dy] = building.door.ends[0].squares[0];

        Object.assign(me, { square: [dx, dy], x: dx + 0.5, y: dy + 0.5, to: null, path: [], order: null });
        whole.command(game.me, { type: "enter", link: building.door.id });
        await on(30);

        const inside = me.map !== "town";

        game.start();

        return { felled: far.slice(0, 12).filter((actor) => actor.dead).length, inside };
    });

    await page.waitForTimeout(2000);

    const last = await known(page);

    expect(played.felled).toBeGreaterThan(0);
    expect(played.inside).toBe(true);
    expect(last.astray).toBe(0);
    // (Indoors: no one out of doors)
    expect(last.known).toBeLessThan(last.all / 2);
    expect(last.caught).toEqual([]);
    expect(errors).toEqual([]);
});

test("a game joined to another's world, through blinkers: brought in, the host's world played on, and nothing a page's error in either", async ({ ownBrowser: browser }) => {
    const host = await (await browser.newContext()).newPage();
    const guest = await (await browser.newContext()).newPage();
    const errors = [];

    for (const page of [host, guest]) {
        await page.addInitScript(() => localStorage.setItem("pellagos.settings", JSON.stringify({ quality: "low", renderScale: 0.5, shadows: false })));
        page.on("pageerror", (error) => errors.push(error.stack ?? error.message));
    }

    // (The guest's character: an elf, as e2e/together.spec.js's)
    await guest.addInitScript(
        (save) => localStorage.setItem("pellagos.save", JSON.stringify(save)),
        { version: 1, seed: 777, created: "2026-09-02T12:00:00.000Z", hero: { name: "Syl", weapon: "bow", race: "elf", parts: [], shape: { macro: { gender: 0.1, muscle: 0.4, weight: 0.3, height: 0.7, bust: 0.4, african: 0.05, asian: 0.15, caucasian: 0.8 }, details: { earLength: 0.9, earPoint: 0.9 } }, look: { skin: { tone: "#ecd0b6" }, eyes: { iris: "#3fa6e8" }, hair: { style: "long", beard: "none", colour: "#e8dcb0" } } } },
    );
    await host.goto("/?play&seed=2&blinkers");
    await playing(host, null, { timeout: 120000 });
    await host.locator("#menubutton").click();
    await host.locator("#invitebutton").click();
    await expect(host.locator("#invitecode")).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });

    const code = await host.locator("#invitecode").textContent();

    await host.locator("#invite").getByRole("button", { name: "Back to the game" }).click();
    await guest.goto(`/?join=${code}&blinkers`);
    await expect(guest.locator("#join")).toBeVisible({ timeout: 60000 });
    await guest.locator("#join").getByRole("button", { name: "Join", exact: true }).click();
    await playing(guest, null, { timeout: 120000 });

    // Both in blinkers, each knowing only what's near its own hero; played on twenty seconds
    for (const page of [host, guest]) {
        const seen = await known(page);

        expect(seen.radius).toBe(192);
        expect(seen.astray).toBe(0);
        expect(seen.hidden).toBeGreaterThan(0);
    }

    await host.waitForTimeout(20000);

    for (const page of [host, guest]) {
        expect(await known(page)).toMatchObject({ astray: 0, caught: [] });
    }

    // (And the guest's copy never astray from the host's for it)
    expect(await guest.evaluate(() => window.pellagos.game.remote.desyncs)).toBe(0);
    expect(errors).toEqual([]);
});
