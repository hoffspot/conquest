import { expect, test } from "@playwright/test";

// Pellagos in a real browser. The page exposes itself as window.pellagos ({ game, session,
// creator, loader, playing }), which these tests use to look inside. Drawing is slow without a
// GPU, so fights are played on with game.advance(), which runs the game without drawing.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

const SAVE = {
    version: 1,
    seed: 4242,
    created: "2026-09-01T12:00:00.000Z",
    hero: {
        name: "Wren",
        weapon: "staff",
        shape: { macro: { gender: 0.1, muscle: 0.5, weight: 0.45, height: 0.5, bust: 0.5, african: 0.3, asian: 0.3, caucasian: 0.4 }, details: {} },
        look: { skin: { tone: "#c28560" }, eyes: { iris: "#4f6b3a" }, hair: { style: "ponytail", beard: "none", colour: "#7a3a1f" } },
    },
};

async function title(page) {
    await page.goto("/");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
}

// Open the game and wait for it to be playing (checking on a timer: a page with nothing changing
// on it may draw no frames). If it isn't in time, what the loading screen says, and the page's
// errors, are in the failure
async function playing(page, address) {
    const errors = [];

    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
    await page.goto(address);

    try {
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000, polling: 250 });
    } catch (error) {
        const where = await page.evaluate(() => ({ screen: document.body.dataset.screen, status: document.querySelector("#loadstatus")?.textContent, amount: document.querySelector("#loadamount")?.textContent })).catch((reason) => ({ unreadable: String(reason) }));

        throw new Error(`Not playing: ${JSON.stringify(where)}; errors: ${JSON.stringify(errors.slice(0, 5))}`, { cause: error });
    }
}

// Where a spot so many metres north of the player is on the screen
async function spotNorth(page, metres) {
    return page.evaluate((metres) => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");

        return session.view.toScreen(avatar.object.position.clone().setZ(avatar.object.position.z - metres));
    }, metres);
}

// Click (or tap) twice, 160 ms apart. Drawing without a GPU takes so long that input sent one
// event after another arrives seconds apart, so these say when they happened, as a device's do
async function doubleTap(page, { x, y }, { touch = false } = {}) {
    const cdp = await page.context().newCDPSession(page);
    const start = Date.now() / 1000;

    for (const [down, at, count] of [[true, 0, 1], [false, 0.06, 1], [true, 0.16, 2], [false, 0.22, 2]]) {
        if (touch) {
            await cdp.send("Input.dispatchTouchEvent", { type: down ? "touchStart" : "touchEnd", touchPoints: down ? [{ x, y }] : [], timestamp: start + at });
        } else {
            await cdp.send("Input.dispatchMouseEvent", { type: down ? "mousePressed" : "mouseReleased", x, y, button: "left", buttons: down ? 1 : 0, clickCount: count, timestamp: start + at });
        }
    }

    await cdp.detach();
}

test("loads everything, listing what it downloads, then shows the title", async ({ page }) => {
    await page.goto("/");

    // Each group of files on the loading screen, with the manifest's sizes
    await expect(page.locator("#loadlist li")).toHaveCount(5);
    await expect(page.locator("#loadlist")).toContainText("3D engine");
    await expect(page.locator("#loadlist")).toContainText("Lettering");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
    await expect(page.locator("#continuebutton")).toBeHidden();

    const loaded = await page.evaluate(() => ({ loaded: window.pellagos.loader.loaded, total: window.pellagos.loader.total, groups: window.pellagos.loader.groups.map((group) => group.done === group.files.length) }));

    expect(loaded.loaded).toBe(loaded.total);
    expect(loaded.total).toBeGreaterThan(2_000_000);
    expect(loaded.groups).toEqual([true, true, true, true, true]);
});

test("debug mode shows how the game runs, and is remembered", async ({ page }) => {
    await title(page);
    await expect(page.locator("#debug")).toBeHidden();

    await page.getByText("Debug mode").click();
    await expect(page.locator("#debug")).toBeVisible();
    await expect(page.locator("#debugstats")).toContainText("Draws");
    await expect(page.locator("#debugstats")).toContainText("Downloaded");

    // Folding it away leaves just its header
    await page.locator("#debugcollapse").click();
    await expect(page.locator("#debugstats")).toBeHidden();
    await page.locator("#debugcollapse").click();

    await page.reload();
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#debug")).toBeVisible();
    await expect(page.locator("#debugswitch")).toBeChecked();

    await page.getByText("Debug mode").click();
    await expect(page.locator("#debug")).toBeHidden();
});

test("makes a character: a random look, a weapon and a name, then plays them in the town square", async ({ page }) => {
    // Every step draws the character, which takes a while without a GPU
    test.setTimeout(180000);
    await title(page);
    await page.getByRole("button", { name: "New character" }).click();
    await expect(page.locator("#create")).toBeVisible();
    await page.waitForFunction(() => window.pellagos.creator?.avatar);

    // The look: body, face, colours and hair tabs, and a random character
    for (const tab of ["Face", "Colours & hair", "Body"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    }

    const before = await page.evaluate(() => JSON.stringify(window.pellagos.creator.hero.shape));

    await page.getByRole("button", { name: "Random" }).click();
    expect(await page.evaluate(() => JSON.stringify(window.pellagos.creator.hero.shape))).not.toBe(before);

    // A weapon: every starting weapon is offered; the bow comes with a quiver; and spiked boots
    // can be worn with it (to kick whoever's next to you)
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await expect(page.locator('.weapon[role="radio"]')).toHaveCount(8);
    await page.locator('[data-weapon="bow"]').click();
    await page.waitForFunction(() => window.pellagos.creator.avatar.character.items.some((item) => item.name === "bow"));
    expect(await page.evaluate(() => window.pellagos.creator.avatar.character.items.map((item) => item.name))).toEqual(expect.arrayContaining(["bow", "quiver"]));
    await expect(page.locator("#bootstoggle")).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("#bootstoggle .numbers")).toContainText("up close (kicks)");
    await page.locator("#bootstoggle").click();
    await expect(page.locator("#bootstoggle")).toHaveAttribute("aria-checked", "true");
    await page.waitForFunction(() => window.pellagos.creator.avatar.character.items.some((item) => item.name === "spikedBoots"));

    // A name
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("  Tamsin  Rowe ");
    await expect(page.locator("#namesummary")).toContainText("Tamsin Rowe, with a bow and spiked boots");
    await page.getByRole("button", { name: "Begin" }).click();

    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#playerplate .name")).toHaveText("Tamsin Rowe");

    const game = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [cx, cy] = game.world.town.centre;
        const [ox, oy] = game.world.origin;

        const character = game.avatars.get("player").character;

        return {
            weapon: player.weapon,
            boots: player.boots,
            equipment: [...character.equipment.values()],
            // (The bow slung on the back to start with)
            sheathed: character.sheathed,
            bowOn: character.items.find((item) => item.name === "bow").parent.name,
            inSquare: Math.hypot(player.x - (ox + cx), player.y - (oy + cy)) < 10,
            saved: JSON.parse(localStorage.getItem("pellagos.save")),
        };
    });

    expect(game.weapon).toBe("bow");
    expect(game.boots).toBe(true);
    expect(game.equipment).toEqual(expect.arrayContaining(["tunic", "bracers", "breeches", "spikedBoots", "bow", "quiver"]));
    expect(game.equipment).not.toContain("boots");
    expect(game.sheathed).toBe(true);
    expect(game.bowOn).toBe("Spine2");
    expect(game.inSquare).toBe(true);
    expect(game.saved.hero.name).toBe("Tamsin Rowe");
    expect(game.saved.hero.weapon).toBe("bow");
    expect(game.saved.hero.boots).toBe(true);
});

test("carries on with the saved character, in the same world", async ({ page }) => {
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), SAVE);
    await title(page);
    await expect(page.locator("#continuebutton")).toHaveText("Continue as Wren");
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const game = await page.evaluate(() => ({ seed: window.pellagos.game.world.seed, weapon: window.pellagos.game.battle.actor("player").weapon, name: document.querySelector("#playerplate .name").textContent }));

    expect(game).toEqual({ seed: 4242, weapon: "staff", name: "Wren" });

    // The menu pauses, and goes back to the title
    await page.locator("#menubutton").click();
    await expect(page.locator("#menu")).toBeVisible();
    await page.getByRole("button", { name: "Back to the title" }).click();
    await expect(page.locator("#title")).toBeVisible();
});

test("the player and the orc draw their weapons and fight when in reach, until one falls", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=sword");

    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const events = [];
        const sword = game.avatars.get("player").character.items.find((item) => item.name === "sword");

        // (Put away to start with: the sword in its scabbard at the hip)
        const before = { sheathed: game.avatars.get("player").character.sheathed, on: sword.parent.name };

        game.stop();

        // Stand the player three squares south of the orc
        const orc = game.battle.actor("orc");
        const player = game.battle.actor("player");

        Object.assign(player, { x: orc.x, y: orc.y + 3, square: [orc.square[0], orc.square[1] + 3] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        const advance = game.battle.advance.bind(game.battle);

        game.battle.advance = (ms) => {
            const happened = advance(ms);

            events.push(...happened);

            return happened;
        };

        for (let second = 0; second < 40 && !orc.dead && !player.dead; second++) {
            game.advance(1);
        }

        const drew = (id) => events.find((event) => event.type === "draw" && event.id === id);
        const struck = (id) => events.find((event) => event.type === "attack" && event.id === id);

        return {
            before,
            drewFirst: ["player", "orc"].every((id) => drew(id)?.on && drew(id).time < struck(id).time),
            attacks: [...new Set(events.filter((event) => event.type === "attack").map((event) => `${event.id}:${event.attack}`))],
            hits: events.filter((event) => event.type === "hit").length,
            dead: events.filter((event) => event.type === "death").map((event) => event.id),
            damageShown: document.querySelectorAll("#floaters .damage").length,
            orcHp: orc.hp,
        };
    });

    expect(fight.before).toEqual({ sheathed: true, on: "Hips" });
    expect(fight.drewFirst).toBe(true);
    expect(fight.attacks).toEqual(expect.arrayContaining(["player:slash", "orc:hack"]));
    expect(fight.hits).toBeGreaterThan(4);
    expect(fight.dead.length).toBe(1);
});

test("blows leave wounds of their weapon's kind, worse below each threshold, with blood on the ground; healed and come back to life, gone", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=bow");

    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;

        game.stop();

        // The player six squares south of the orc, shooting as it comes
        const orc = battle.actor("orc");
        const player = battle.actor("player");

        Object.assign(player, { x: orc.x, y: orc.y + 6, square: [orc.square[0], orc.square[1] + 6] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        for (let second = 0; second < 40 && orc.hp >= orc.maxHp / 2 && !player.dead; second++) {
            game.advance(0.5, { render: false });
        }

        const wounds = game.wounds.get("orc");
        const blood = (id) => game.wounds.get(id).data.filter((value, i) => i % 4 === 0 && value > 0).length;

        return {
            hp: orc.hp,
            kinds: [...new Set(wounds.list.map((wound) => wound.kind))],
            stage: wounds.stage,
            marks: wounds.list.filter((wound) => wound.mark).length,
            // Arrows left in the wounds, held by the bones they went into
            arrows: wounds.list.filter((wound) => wound.arrow?.parent?.isBone).length,
            blood: blood("orc"),
            splats: game.effects.splats.list.filter(Boolean).length,
            skin: game.avatars.get("orc").character.materials.body.customProgramCacheKey(),
        };
    });

    expect(fight.hp).toBeLessThan(25);
    expect(fight.kinds).toEqual(["pierce"]);
    expect(fight.stage).toBeGreaterThanOrEqual(2);
    expect(fight.marks).toBeGreaterThan(0);
    expect(fight.arrows).toBeGreaterThan(1);
    expect(fight.blood).toBeGreaterThan(200);
    expect(fight.splats).toBeGreaterThan(0);
    expect(fight.skin).toBe("wounded-skin");

    // Fought to the end: whoever falls lies in a pool of blood. Healed, the other's worse
    // wounds are gone; come back to life, all of them, arrows and pool too
    const end = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { battle } = game;
        const orc = battle.actor("orc");
        const player = battle.actor("player");

        for (let second = 0; second < 40 && !orc.dead && !player.dead; second++) {
            game.advance(0.5, { render: false });
        }

        const fallen = orc.dead ? orc : player;
        const standing = orc.dead ? player : orc;

        // Down, bleeding (and nobody else hurting the one left standing)
        game.advance(2.5);

        const pool = game.pools.get(fallen.id)?.spot;
        const arrows = game.wounds.get(fallen.id).list.map((wound) => wound.arrow).filter(Boolean);
        const hurt = game.wounds.get(standing.id).list.length;

        // Hurt below a quarter, then healed back above half
        standing.hp = Math.round(standing.maxHp * 0.2);
        game.wounds.get(standing.id).hit({ reaction: "hack", from: 0, hp: standing.hp, maxHp: standing.maxHp, before: standing.maxHp });
        standing.spellReadyAt = battle.time;

        const worst = game.wounds.get(standing.id).stage;

        // (A little better by the time it lands, so it takes them back above half)
        battle.cast(standing.id, "heal");
        standing.hp = Math.round(standing.maxHp * 0.4);
        game.advance(1);

        const healed = { hp: standing.hp, stage: game.wounds.get(standing.id).stage, worst };

        for (let second = 0; second < 40 && fallen.dead; second++) {
            game.advance(1);
        }

        return {
            fallen: fallen.id,
            pool: Boolean(pool),
            poolSize: pool?.size ?? 0,
            arrows: arrows.length,
            hurt,
            healed,
            alive: !fallen.dead,
            woundsAfter: game.wounds.get(fallen.id).list.length,
            arrowsAfter: arrows.filter((arrow) => arrow.parent).length,
            pools: game.pools.size,
        };
    });

    expect(end.pool).toBe(true);
    expect(end.poolSize).toBeGreaterThan(1);
    expect(end.hurt).toBeGreaterThan(0);
    expect(end.healed.worst).toBe(3);
    expect(end.healed.hp).toBeGreaterThanOrEqual(25);
    expect(end.healed.stage).toBeLessThanOrEqual(1);
    expect(end.alive).toBe(true);
    expect(end.woundsAfter).toBe(0);
    expect(end.arrowsAfter).toBe(0);
    expect(end.pools).toBe(0);
});

test("tapping the ground walks the player there", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const walked = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const start = [player.x, player.y];

        game.stop();

        // A spot a few metres north of the player, on the screen
        const avatar = game.avatars.get("player");
        const spot = session.view.toScreen(avatar.object.position.clone().setZ(avatar.object.position.z - 3));

        game.tap(spot.x, spot.y);
        game.advance(4);

        return { start, end: [player.x, player.y] };
    });

    expect(walked.end[1]).toBeLessThan(walked.start[1] - 2);
});

test("swiping up from the player sends them straight ahead, running, as far as the way is clear", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // (Turned first the way that's clearest ahead of them, whatever's round the market where they
    // start: the well, stalls, a landmark)
    await page.evaluate(async () => {
        const { lineAhead } = await import("/js/core/pathfinding.js");
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const avatar = game.avatars.get("player");
        const from = [Math.floor(player.x), Math.floor(player.y)];
        const ways = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4 - Math.PI);
        const clearest = ways.reduce((best, way) => (lineAhead(game.world.maps[player.map], from, way).length > lineAhead(game.world.maps[player.map], from, best).length ? way : best));

        player.facing = clearest;
        avatar.facing = clearest;
        avatar.object.rotation.y = clearest;
    });

    // (The game playing on, taking taps and swipes)
    const start = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");

        return { at: session.view.toScreen(avatar.point(0.5)), facing: avatar.facing, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    // A quick flick up from the player (said when it happened, as a device would)
    const cdp = await page.context().newCDPSession(page);
    const now = Date.now() / 1000;
    const { x, y } = start.at;

    for (const [type, dy, at] of [["mousePressed", 0, 0], ["mouseMoved", -25, 0.05], ["mouseMoved", -70, 0.1], ["mouseReleased", -70, 0.15]]) {
        await cdp.send("Input.dispatchMouseEvent", { type, x, y: y + dy, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, timestamp: now + at });
    }

    const moved = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const order = player.order;
        const pitch = session.view.pitch;

        game.stop();
        game.advance(1.5);

        const avatar = game.avatars.get("player");

        return { order, pitch, running: player.running, pace: player.pace, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    // (A swipe, not a drag: the camera's not tilted)
    expect(moved.pitch).toBe(45);
    expect(moved.order?.type).toBe("move");
    expect(moved.order.run).toBe(true);
    expect(moved.running).toBe(true);

    // The way they faced
    const along = (moved.x - start.x) * Math.sin(start.facing) + (moved.z - start.z) * Math.cos(start.facing);
    const across = Math.abs((moved.x - start.x) * Math.cos(start.facing) - (moved.z - start.z) * Math.sin(start.facing));

    expect(along).toBeGreaterThan(3);
    expect(across).toBeLessThan(1);
});

test("the camera follows from the first step, swinging round behind the player", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const camera = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const avatar = game.avatars.get("player");
        const spot = (dx, dz) => view.toScreen(avatar.object.position.clone().add({ x: dx, y: 0, z: dz }));
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

        game.stop();

        const start = { x: view.focus.x, yaw: view.yaw, pitch: view.pitch };

        // A few steps east: the camera keeps up from the first, and starts round behind them
        const east = spot(4, 0);

        game.tap(east.x, east.y);
        game.advance(0.8);

        const firstSteps = { x: view.focus.x, yaw: view.yaw };

        // Walking on east: round behind them, the player in the middle of the screen
        const far = spot(12, 0);

        game.tap(far.x, far.y);
        game.advance(2.5);

        const from = avatar.object.position.clone();

        game.advance(1);

        const heading = avatar.object.position.clone().sub(from);
        const behind = Math.atan2(-heading.x, -heading.z);

        return { start, firstSteps, off: Math.abs(wrap(view.yaw - behind)), walked: heading.length(), onScreen: view.fromMiddle(avatar.point(0.55)) };
    });

    expect(camera.start.yaw).toBe(0);
    expect(camera.start.pitch).toBe(45);
    expect(camera.firstSteps.x).toBeGreaterThan(camera.start.x + 0.3);
    expect(camera.firstSteps.yaw).toBeLessThan(-0.15);
    expect(camera.walked).toBeGreaterThan(1.5);
    expect(camera.off).toBeLessThan(0.3);
    expect(Math.abs(camera.onScreen.x)).toBeLessThan(0.2);
    expect(Math.abs(camera.onScreen.y)).toBeLessThan(0.3);
});

test("dragging turns the camera round the player and tilts it; it holds while they stand, and swings back behind them once they walk", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const before = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        return { yaw: session.view.yaw, pitch: session.view.pitch, square: [...player.square], width: session.view.canvas.clientWidth, height: session.view.canvas.clientHeight };
    });

    // A drag from off to the side of the player: right and up
    const [x, y] = [before.width * 0.2, before.height * 0.75];

    await page.mouse.move(x, y);
    await page.mouse.down();

    for (let k = 1; k <= 10; k++) {
        await page.mouse.move(x + k * 18, y - k * 6);
    }

    await page.mouse.up();

    const dragged = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.stop();

        const turned = { yaw: session.view.yaw, pitch: session.view.pitch, order: player.order?.type ?? null };

        // Standing a while: it holds where it was turned
        game.advance(2);

        return { ...turned, held: { yaw: session.view.yaw, pitch: session.view.pitch } };
    });

    const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

    // Dragged right, it looks further right (turning clockwise from above); dragged up, it looks
    // further up (tilting lower), by as much as the drag
    expect(wrap(dragged.yaw - before.yaw)).toBeCloseTo((-180 / before.width) * Math.PI, 1);
    expect(dragged.pitch).toBeLessThan(before.pitch - 3);
    expect(dragged.order).toBe(null);
    expect(dragged.held.yaw).toBeCloseTo(dragged.yaw, 5);
    expect(dragged.held.pitch).toBeCloseTo(dragged.pitch, 5);

    // Walking again (north, a few steps): back round behind them, facing the way they go, still
    // tilted as it was
    const walked = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        game.battle.command("player", { type: "move", to: [player.square[0], player.square[1] - 6] });
        game.advance(2.5);

        return { yaw: session.view.yaw, pitch: session.view.pitch };
    });

    expect(Math.abs(wrap(walked.yaw))).toBeLessThan(0.2);
    expect(walked.pitch).toBeCloseTo(dragged.pitch, 5);
});

test("in the town, the camera comes in closer than a building in the way, or rises over it", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const views = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const squares = game.world.maps.town.squares;
        const buildings = game.town.buildings;
        const { at, width, height } = game.world.stamp;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Somewhere with a building a couple of squares south of the player (behind them, as the
        // camera looks north), and somewhere open all round
        let walled = null;
        let open = null;

        // (In the town)
        const none = (x, y) => {
            for (let dy = -3; dy < 12; dy++) {
                for (let dx = -12; dx < 12; dx++) {
                    if (buildings.at(x + dx, y + dy) > 0) {
                        return false;
                    }
                }
            }

            return true;
        };

        for (let y = at[1] + 4; y < at[1] + height - 12 && !(walled && open); y++) {
            for (let x = at[0] + 12; x < at[0] + width - 12 && !(walled && open); x++) {
                const clear = [0, 1].every((dy) => !squares.blocked(x, y + dy));

                if (!walled && clear && buildings.at(x, y + 2) > 5 && buildings.at(x, y + 3) > 5) {
                    walled = [x, y];
                }

                if (!open && clear && none(x, y)) {
                    open = [x, y];
                }
            }
        }

        const look = ([x, y]) => {
            const player = game.battle.actor("player");

            Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.advance(1.5);
            game.cameraFollow.yaw = 0;
            game.cameraFollow.turning = 0;
            game.advance(1.5);

            const camera = view.camera.position;
            const height = buildings.at(camera.x, camera.z);

            return { pulled: view.pulled, lifted: view.lifted, clearOfIt: camera.y > height, hidden: view.hidden(game.avatars.get("player").point(0.55)) };
        };

        return { walled: walled && look(walled), open: open && look(open) };
    });

    expect(views.walled).not.toBe(null);
    expect(views.walled.pulled + views.walled.lifted).toBeGreaterThan(1);
    expect(views.walled.clearOfIt).toBe(true);
    expect(views.open).not.toBe(null);
    expect(views.open.pulled).toBeLessThan(0.05);
    expect(views.open.lifted).toBeLessThan(0.5);
});

test("walks out of the town into the world, drawn round the player as they go, with no loading", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const trip = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const world = game.world.maps.town;
        const key = (cx, cy) => cy * 128 + cx;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Somewhere open about 250 metres west of the town
        let goal = null;

        for (let d = 0; d < 60 && !goal; d++) {
            for (const y of [Math.floor(player.y) + d, Math.floor(player.y) - d]) {
                if (!goal && !world.squares.blocked(game.world.stamp.at[0] - 250, y)) {
                    goal = [game.world.stamp.at[0] - 250, y];
                }
            }
        }

        const before = [...game.chunks.drawn.keys()];

        game.battle.command("player", { type: "move", to: goal });

        // (Walking, it's three minutes or so: played on without drawing but every eight seconds)
        for (let k = 0; k < 40 && player.order; k++) {
            game.advance(8);
        }

        game.minimap.drawn = -Infinity;
        game.advance(1);

        const [cx, cy] = [Math.floor(player.x / 64), Math.floor(player.y / 64)];
        const [x0, z0, across] = game.minimap.shown();
        const round = [];

        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                round.push(game.chunks.drawn.has(key(cx + dx, cy + dy)));
            }
        }

        return {
            arrived: Math.hypot(player.x - goal[0] - 0.5, player.y - goal[1] - 0.5) < 1.5,
            outside: !world.inTown(Math.floor(player.x), Math.floor(player.y)),
            round,
            near: [...game.chunks.drawn.values()].every((drawn) => Math.max(Math.abs(drawn.cx - cx), Math.abs(drawn.cy - cy)) <= 3),
            dropped: before.filter((drawn) => !game.chunks.drawn.has(drawn)).length,
            mapped: player.x > x0 && player.x < x0 + across && player.y > z0 && player.y < z0 + across,
        };
    });

    expect(trip.arrived).toBe(true);
    expect(trip.outside).toBe(true);
    expect(trip.round).toEqual(Array(25).fill(true));
    expect(trip.near).toBe(true);
    expect(trip.dropped).toBeGreaterThan(0);
    expect(trip.mapped).toBe(true);
});

test("once a tap lets it make sound, the music plays on recordings of real instruments", async ({ page }) => {
    const recordings = [];

    page.on("response", (response) => /\/music\/.+\.mp3$/.test(response.url()) && recordings.push(response.status()));
    await playing(page, "/?play&seed=1");
    await page.mouse.click(20, 400);

    // Every recording downloaded and decoded, and the score under way
    await page.waitForFunction(() => {
        const { sound } = window.pellagos.session;

        return sound.recordings.size === 0 && sound.instruments.size > 40 && sound.music.start !== null;
    }, null, { timeout: 30000 });
    expect(recordings.length).toBeGreaterThan(40);
    expect(recordings.every((status) => status === 200)).toBe(true);

    // Stopped by the browser (as a call or an alarm would), it starts again by itself, and the
    // music carries on; closed, it's made anew and the music carries on from where it was
    const going = () => page.evaluate(() => {
        const { sound } = window.pellagos.session;

        return { state: sound.context.state, index: sound.music.index };
    });
    const musicMoves = async () => {
        const { index } = await page.evaluate(() => ({ index: window.pellagos.session.sound.music.index }));

        await page.waitForFunction((index) => window.pellagos.session.sound.music.index > index, index, { timeout: 15000 });
    };

    await page.evaluate(() => window.pellagos.session.sound.context.suspend());
    await page.waitForFunction(() => window.pellagos.session.sound.context.state === "running", null, { timeout: 10000 });
    await musicMoves();

    const before = await page.evaluate(() => {
        const { sound } = window.pellagos.session;

        window.oldContext = sound.context;
        sound.context.close();

        return sound.music.index;
    });

    await page.waitForFunction(() => {
        const { sound } = window.pellagos.session;

        return sound.context !== window.oldContext && sound.context.state === "running";
    }, null, { timeout: 10000 });
    await musicMoves();
    expect((await going()).index).toBeGreaterThanOrEqual(before);
});

test("double-clicking the ground runs there, using stamina, shown by an orange bar until it's back", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const bar = page.locator("#playerplate .bar.stamina");
    const order = () => page.evaluate(() => window.pellagos.game.battle.actor("player").order);
    const spot = await spotNorth(page, 4);

    await expect(bar).toBeHidden();

    // A click walks, and a shift-click (not so soon as to be a double click) runs
    await page.mouse.click(spot.x, spot.y);
    expect((await order()).run).toBe(false);
    await page.waitForTimeout(500);
    await page.keyboard.down("Shift");
    await page.mouse.click(spot.x, spot.y);
    await page.keyboard.up("Shift");
    expect((await order()).run).toBe(true);
    await page.evaluate(() => window.pellagos.game.battle.command("player", { type: "stop" }));

    // A spot a few metres north of the player, double-clicked
    await doubleTap(page, spot);

    const ran = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const order = { ...player.order };
        let fastest = 0;

        game.stop();

        for (let k = 0; k < 20; k++) {
            game.advance(0.05, { render: false });
            fastest = Math.max(fastest, player.pace);
        }

        return { order, fastest, walk: player.speed, stamina: player.stamina, maxStamina: player.maxStamina };
    });

    expect(ran.order.run).toBe(true);
    expect(ran.fastest).toBeGreaterThan(ran.walk * 2);
    expect(ran.stamina).toBeLessThan(ran.maxStamina);
    await expect(bar).toBeVisible();
    await expect(bar).toHaveText(`${Math.floor(ran.stamina)} / ${ran.maxStamina}`);
    expect(await bar.locator(".fill").evaluate((fill) => getComputedStyle(fill).backgroundImage)).toContain("rgb(236, 138, 28)");

    // Rested, it's full again, and the bar goes
    await page.evaluate(() => window.pellagos.game.advance(20));
    await expect(bar).toBeHidden();
});

test("tapping an enemy rings it as the player's target, until they're told to walk away", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const target = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const ring = game.effects.targetRing;
        const square = [player.square[0] + 3, player.square[1] - 3];

        game.stop();

        // The orc, standing a few squares from the player
        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        game.advance(0.1);

        const before = ring.visible;
        const at = session.view.toScreen(game.avatars.get("orc").point(0.5));

        game.tap(at.x, at.y);
        game.advance(0.5);

        const orcAt = game.avatars.get("orc").object.position;
        const ringed = { visible: ring.visible, off: Math.hypot(ring.position.x - orcAt.x, ring.position.z - orcAt.z), plate: document.querySelector(".floater.targeted")?.dataset.id ?? null };
        const away = session.view.toScreen(game.avatars.get("player").object.position.clone().setZ(orcAt.z + 6));

        game.tap(away.x, away.y, { time: performance.now() + 1000 });
        game.advance(0.2);

        return { before, ringed, after: { visible: ring.visible, plate: document.querySelector(".floater.targeted")?.dataset.id ?? null } };
    });

    expect(target.before).toBe(false);
    expect(target.ringed).toEqual({ visible: true, off: expect.any(Number), plate: "orc" });
    expect(target.ringed.off).toBeLessThan(0.01);
    expect(target.after).toEqual({ visible: false, plate: null });
});

test("tapping the tavern's door lights its edge green, and the player walks in: a couple of steps inside, facing the door; up the stairs (where a courtesan beckons), down, and out; each time a tap round them is a step, not back through", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Tap the door or stairs (a link's end on the map shown), and play on until through
    const through = (map, kind, seconds) => page.evaluate(({ map, kind, seconds }) => {
        const { game, session } = window.pellagos;
        const target = game.doors.targets.find((each) => each.map === map && each.link.kind === kind);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);
        game.advance(0.3);

        const tapped = { order: game.battle.actor("player").order?.type ?? null, glowing: target.glow.visible };

        game.advance(seconds);

        const player = game.battle.actor("player");

        return { ...tapped, map: player.map, shown: game.mapId, square: player.square, facing: player.facing, minimap: game.minimap.map.id, heard: session.sound.place };
    }, { map, kind, seconds });

    // Just come through: taps on the ground round the player (either side, and behind them)
    // walk them there, and don't take them back through
    const tapsRound = () => page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");
        const orders = [];

        for (const [side, back] of [[1, 0], [-1, 0], [0, -1.2], [1, -1]]) {
            const facing = avatar.facing;
            const at = avatar.object.position.clone().add({ x: side * Math.cos(facing) + back * Math.sin(facing), y: 0, z: -side * Math.sin(facing) + back * Math.cos(facing) });
            const spot = session.view.toScreen(at);

            game.tap(spot.x, spot.y, { time: performance.now() + 5000 * (orders.length + 1) });
            orders.push(game.battle.actor("player").order?.type ?? null);
            game.battle.command("player", { type: "stop" });
        }

        return orders;
    });

    // Outside the door, the orc out of the way
    const outside = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "move", to: game.world.tavern.outside });
        game.advance(25);

        const [doorX, doorY] = game.world.maps.taproom.marks.D[0];

        return { square: game.battle.actor("player").square, outside: game.world.tavern.outside, inside: [doorX, doorY - 2], top: game.world.maps.upstairs.marks[">"][0] };
    });

    expect(outside.square).toEqual(outside.outside);

    const inside = await through("town", "door", 5);

    expect(inside).toEqual({ order: "enter", glowing: true, map: "taproom", shown: "taproom", square: outside.inside, facing: 0, minimap: "taproom", heard: "taproom" });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        return { town: game.town.object.visible, taproom: game.interiors.get("taproom").object.visible, upstairs: game.interiors.get("upstairs").object.visible };
    })).toEqual({ town: false, taproom: true, upstairs: false });

    // The folk: seven in the taproom, seen, without name plates; the patrons rest (raising their
    // tankards, drinking, laughing); tapping one doesn't set the player on them
    const folk = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const here = game.battle.actors.filter((actor) => actor.neutral && actor.map === "taproom");
        const acted = new Set();

        for (let k = 0; k < 40; k++) {
            game.advance(0.25, { render: false });

            for (const actor of here) {
                const name = game.avatars.get(actor.id).actions.attack?.name;

                if (name) {
                    acted.add(name);
                }
            }
        }

        const drinker = game.avatars.get("drinker");
        const spot = session.view.toScreen(drinker.point(0.5));

        game.tap(spot.x, spot.y, { time: performance.now() + 5000 });
        game.advance(0.2);

        return {
            ids: here.map(({ id }) => id),
            shown: here.every(({ id }) => game.avatars.get(id).object.visible),
            plates: document.querySelectorAll(".floater").length,
            acted: [...acted].sort(),
            order: game.battle.actor("player").order?.type ?? null,
            madam: game.avatars.get("madam").object.visible,
        };
    });

    expect(folk).toMatchObject({ ids: ["barkeep", "wench", "wench2", "drinker", "alewife", "farmer", "greybeard"], shown: true, plates: 1, madam: false });
    expect(folk.acted).toContain("rest:patron");
    expect(folk.order).not.toBe("engage");

    // Near the stairs, then up them, and down again
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.battle.command("player", { type: "move", to: [3, 3] });
        game.advance(8);
    });

    const up = await through("taproom", "stairs", 6);

    expect(up).toMatchObject({ order: "enter", glowing: true, map: "upstairs", shown: "upstairs", square: [6, 3], facing: Math.PI, minimap: "upstairs", heard: "upstairs" });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("madam").object.visible)).toBe(true);

    // Along the hallway to the first bedroom's door: the courtesan in it (and the one across the
    // way) turns and beckons the player in, and the screen says so; she's in see-through lace.
    // Then back to the top of the stairs
    const beckoned = await page.evaluate(() => {
        const { game } = window.pellagos;
        const courtesan = game.avatars.get("courtesan");
        let seen = null;

        game.battle.command("player", { type: "move", to: [10, 7] });

        for (let k = 0; k < 60 && !seen; k++) {
            game.advance(0.25);

            if (courtesan.actions.attack?.name === "beckon") {
                game.advance(0.1);
                seen = document.body.textContent.match(/\w+ beckons you over/)?.[0] ?? "";
            }
        }

        const lace = courtesan.character.garments.filter((mesh) => mesh.material.transparent).map(({ name }) => name).sort();

        game.battle.command("player", { type: "move", to: game.world.maps.upstairs.marks[">"][0] });
        game.advance(10);

        return { seen, names: ["courtesan", "courtesan3"].map((id) => game.world.folk.find((one) => one.id === id).name.split(" ")[0]), lace, shown: courtesan.object.visible, back: game.battle.actor("player").square };
    });

    expect(beckoned.shown).toBe(true);
    expect(beckoned.names.map((name) => `${name} beckons you over`)).toContain(beckoned.seen);
    expect(beckoned.lace).toEqual(["choker", "laceBraBlack", "laceBriefsBlack", "stockingsBlack", "suspendersBlack"]);
    expect(beckoned.back).toEqual(outside.top);

    // (Standing at their top, straight down)
    const down = await through("upstairs", "stairs", 3);

    expect(down).toMatchObject({ map: "taproom", shown: "taproom", square: [1, 3], facing: Math.PI });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);

    // And out (from just inside it, so no one's in the way to tap instead), onto the square
    // outside the door
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.battle.command("player", { type: "move", to: [7, 8] });
        game.advance(10);
    });

    const out = await through("taproom", "door", 6);

    expect(out).toMatchObject({ order: "enter", map: "town", shown: "town", square: outside.outside, minimap: "town", heard: "town" });
    expect(await tapsRound()).toEqual(["move", "move", "move", "move"]);
});

test("every tavern can be gone into: got ready as the player comes near, its own room and folk inside; let go once they're far off, and built at once if they walk straight in", async ({ page }) => {
    // (Seed 2's town has a second tavern, the Stag's Head, an inn)
    await playing(page, "/?play&seed=2");

    // Put the player (or anyone) on a square, at once
    const helpers = () => {
        window.put = (id, [x, y]) => {
            const { game } = window.pellagos;
            const actor = game.battle.actor(id);

            Object.assign(actor, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
            game.avatars.get(id).place(x + 0.5, y + 0.5, actor.facing);
            game.previous.set(id, { x: actor.x, y: actor.y });
        };
    };

    await page.evaluate(helpers);

    // Near its door, it's got ready a piece at a time: its floors, then its folk
    const near = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        const building = [...game.world.interiors.buildings.values()].find((each) => each.entrance && each.kind === "tavern");
        const before = game.visits.has(building.key);

        // (Looked over at the next frame)
        window.put("player", building.door.ends[0].arrive);
        game.host.lookAt = 0;
        game.advance(0.1);

        const visit = game.visits.get(building.key);
        const started = { maps: visit.maps.length, folk: visit.folk.length, left: visit.queue.length };

        game.advance(2);

        return { key: building.key, name: building.name, before, started, ready: { maps: visit.maps.length, folk: visit.folk.length, left: visit.queue.length }, hidden: visit.maps.every((id) => !game.interiors.get(id).object.visible) };
    });

    expect(near.name).toBe("The Stag's Head");
    expect(near.before).toBe(false);
    expect(near.started.folk).toBeLessThan(near.ready.folk);
    expect(near.ready).toEqual({ maps: 2, folk: expect.any(Number), left: 0 });
    expect(near.ready.folk).toBeGreaterThanOrEqual(6);
    expect(near.hidden).toBe(true);

    // Through its door: its own taproom, heard and mapped as one, with its own folk
    const inside = await page.evaluate((key) => {
        const { game, session } = window.pellagos;
        const target = game.doors.targets.find((each) => each.map === "town" && each.link.id === `${key}/door`);
        const spot = session.view.toScreen(target.box.getCenter(target.box.min.clone()));

        game.tap(spot.x, spot.y);
        game.advance(4);

        const player = game.battle.actor("player");
        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");

        return { map: player.map, shown: game.mapId, minimap: game.minimap.map.id, heard: session.sound.place, visible: game.interiors.get(player.map).object.visible, town: game.town.object.visible, folk: folk.map(({ id }) => id), names: folk.map(({ name }) => name), wenches: game.world.folk.map(({ name }) => name) };
    }, near.key);

    expect(inside).toMatchObject({ map: `${near.key}/taproom`, shown: `${near.key}/taproom`, minimap: `${near.key}/taproom`, heard: "taproom", visible: true, town: false });
    expect(inside.folk).toContain(`${near.key}/barkeep`);
    expect(inside.names.filter((name) => inside.wenches.includes(name))).toEqual([]);

    // Out, and far off: let go (its plans kept)
    const far = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get(key);

        game.battle.command("player", { type: "enter", link: `${key}/door` });
        game.advance(4);

        const out = game.battle.actor("player").map;

        window.put("player", game.world.spawns.player.map((value) => value - 100));
        game.host.lookAt = 0;
        game.advance(0.2);

        return { out, visited: game.visits.has(key), folk: game.battle.actors.filter(({ id }) => id.startsWith(`${key}/`)).length, floors: building.maps.filter((id) => game.interiors.has(id)).length, plans: building.maps.filter((id) => game.world.maps[id]).length };
    }, near.key);

    expect(far).toEqual({ out: "town", visited: false, folk: 0, floors: 0, plans: 2 });

    // Straight back in through the door, before it's got ready: built there and then
    const again = await page.evaluate((key) => {
        const { game } = window.pellagos;
        const [outside] = game.world.interiors.buildings.get(key).door.ends;

        window.put("player", outside.squares[0]);
        game.battle.command("player", { type: "enter", link: `${key}/door` });
        game.advance(0.2);

        const player = game.battle.actor("player");

        return { map: player.map, shown: game.mapId, visible: game.interiors.get(player.map)?.object.visible ?? false, folk: game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player").length };
    }, near.key);

    expect(again).toEqual({ map: `${near.key}/taproom`, shown: `${near.key}/taproom`, visible: true, folk: expect.any(Number) });
    expect(again.folk).toBeGreaterThanOrEqual(5);
});

test("the smithy: the smith heats, hammers and quenches the work, the apprentice pumps the bellows and turns the grindstone, each heard and seen at it", async ({ page }) => {
    // (Seed 2's town's smithy, a few steps from the start)
    await playing(page, "/?play&seed=2");

    const smithy = await page.evaluate(async () => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "blacksmith");
        const player = game.battle.actor("player");
        const heard = [];
        const acts = [];
        const play = session.sound.play.bind(session.sound);

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        session.sound.play = (name, options) => {
            heard.push(name);

            return play(name, options);
        };

        // Straight through its door (built there and then)
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        // A while at work (what each of them does, as the battle says)
        for (let k = 0; k < 90; k++) {
            game.advance(0.5, { render: false });

            for (const id of [`${building.key}/smith`, `${building.key}/apprentice`]) {
                const name = game.avatars.get(id).actions.attack?.name;

                if (name && !acts.includes(`${id.split("/")[1]}:${name}`)) {
                    acts.push(`${id.split("/")[1]}:${name}`);
                }
            }
        }

        const smith = game.world.interiors.buildings.get(building.key).folk.find(({ local }) => local === "smith");

        return { map: player.map, name: building.name, smith: smith.name, holding: [...game.avatars.get(smith.id).character.equipment.values()], acts, heard: [...new Set(heard)], place: session.sound.place };
    });

    expect(smithy.map).toMatch(/blacksmith-\d+\/forge$/);
    expect(smithy.name).toBe(`${smithy.smith.split(" ")[1]}'s Forge`);
    expect(smithy.holding).toEqual(expect.arrayContaining(["smithHammer", "tongs", "leatherApron"]));
    expect(smithy.acts).toEqual(expect.arrayContaining(["smith:heat", "smith:forge", "smith:quench", "apprentice:pump", "apprentice:crank"]));
    expect(smithy.heard).toEqual(expect.arrayContaining(["anvil", "hiss", "bellows", "grind"]));
    expect(smithy.place).toBe("smithy");
});

test("the temple: the priest in white blesses the pews and lights the shrines' candles, worshippers pray, and the priest tells of the temple's patron", async ({ page }) => {
    // (Seed 2's town's temple, to Aurelia, a few steps from the start)
    await playing(page, "/?play&seed=2");

    const temple = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "church");
        const player = game.battle.actor("player");
        const acts = [];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Straight through its door
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");
        const priest = folk.find(({ role }) => role === "priest");

        // A while inside: what the priest and the worshippers do
        for (let k = 0; k < 80; k++) {
            game.advance(0.5, { render: false });

            for (const one of folk) {
                const name = game.avatars.get(one.id).actions.attack?.name;

                if (name && !acts.includes(`${one.role}:${name}`)) {
                    acts.push(`${one.role}:${name}`);
                }
            }
        }

        // Up to the priest, to ask whose temple it is
        game.approaching = priest.id;
        game.battle.command("player", { type: "approach", target: priest.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking?.conversation;
        const asked = conversation?.choices.findIndex(({ text }) => text.includes("Whose temple"));

        conversation?.choose(asked);

        return {
            map: player.map,
            name: building.name,
            wearing: [...game.avatars.get(priest.id).character.equipment.values()],
            roles: folk.map(({ role }) => role),
            acts,
            patron: conversation?.line ?? null,
            place: session.sound.place,
        };
    });

    expect(temple.map).toMatch(/church-\d+\/nave$/);
    expect(temple.name).toBe("the Temple of Aurelia");
    expect(temple.wearing).toEqual(expect.arrayContaining(["alb", "chasuble", "albSkirt"]));
    expect(temple.roles.slice(0, 2)).toEqual(["priest", "acolyte"]);
    expect(temple.roles.filter((role) => role === "worshipper").length).toBeGreaterThanOrEqual(2);
    expect(temple.acts).toEqual(expect.arrayContaining(["priest:bless", "priest:light", "acolyte:light"]));
    expect(temple.acts.some((act) => act.startsWith("worshipper:rest:"))).toBe(true);
    expect(temple.patron).toMatch(/This is Aurelia's house, the Dawnmother/);
    expect(temple.place).toBe("temple");
});

test("the adventurers' guild: the receptionist stamps notices behind her counter, adventurers read the quest board and drink at the tables, and she signs the player up", async ({ page }) => {
    // (Seed 2's town's guild)
    await playing(page, "/?play&seed=2");

    const guild = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");
        const acts = [];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        // Straight through its door
        const [x, y] = building.door.ends[0].squares[0];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const folk = game.battle.actors.filter((actor) => actor.map === player.map && actor.id !== "player");
        const receptionist = folk.find(({ role }) => role === "receptionist");

        // A while inside: what the receptionist and the adventurers do
        for (let k = 0; k < 60; k++) {
            game.advance(0.5, { render: false });

            for (const one of folk) {
                const name = game.avatars.get(one.id).actions.attack?.name;

                if (name && !acts.includes(`${one.role}:${name}`)) {
                    acts.push(`${one.role}:${name}`);
                }
            }
        }

        // Up to the counter, to register
        game.approaching = receptionist.id;
        game.battle.command("player", { type: "approach", target: receptionist.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        const conversation = game.talking?.conversation;

        conversation?.choose(conversation.choices.findIndex(({ text }) => text.includes("register")));

        return {
            map: player.map,
            name: building.name,
            wearing: [...game.avatars.get(receptionist.id).character.equipment.values()],
            sheathed: folk.filter(({ role }) => role === "adventurer").map(({ id }) => game.avatars.get(id).character.sheathed),
            roles: folk.map(({ role }) => role),
            acts,
            registered: conversation?.line ?? null,
            place: session.sound.place,
        };
    });

    expect(guild.map).toMatch(/guild-\d+\/hall$/);
    expect(guild.name).toBe("the Adventurers' Guild");
    expect(guild.wearing).toEqual(expect.arrayContaining(["guildBlouse", "guildVest", "guildSkirt"]));
    expect(guild.roles.slice(0, 3)).toEqual(["receptionist", "adventurer", "adventurer"]);
    expect(guild.roles.filter((role) => role === "patron").length).toBeGreaterThanOrEqual(2);
    expect(guild.sheathed).toEqual([true, true]);
    expect(guild.acts).toEqual(expect.arrayContaining(["receptionist:stamp", "adventurer:read"]));
    expect(guild.registered).toMatch(/^Wonderful! Name: .+\. Rank: Copper\./);
    expect(guild.place).toBe("guild");
});

test("tapping someone walks the player up to talk: their name and what they are, what they say, replies that lead on, Escape to stop", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Into the taproom, the orc out of the way, then tap the barkeep
    const tapped = await page.evaluate(() => {
        const { game, session } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "enter", link: "tavern-door" });
        game.advance(30);
        game.battle.command("player", { type: "move", to: [7, 6] });
        game.advance(5);

        const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });

        const order = game.battle.actor("player").order?.type ?? null;

        game.advance(8);

        return { map: game.battle.actor("player").map, order, name: game.world.folk.find(({ id }) => id === "barkeep").name, talking: game.battle.actor("barkeep").talkingTo };
    });

    expect(tapped).toMatchObject({ map: "taproom", order: "approach", talking: "player" });

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(tapped.name);
    await expect(talk.locator(".talk-title")).toHaveText("Barkeep");
    await expect(talk.locator(".talk-line")).toContainText(tapped.name.split(" ")[0]);
    await expect(talk.locator(".talk-choice").last()).toHaveText(/Farewell/);

    // Asking for news: he answers, with things to ask next
    await talk.getByRole("button", { name: /news/ }).click();
    await expect(talk.getByRole("button", { name: /Thanks for that/ })).toBeVisible();

    const news = await talk.locator(".talk-line").textContent();

    expect(news.length).toBeGreaterThan(20);

    // Its number on the keyboard says it; Escape stops talking (without pausing the game)
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press(String(await talk.locator(".talk-choice").count()));
    await expect(talk.locator(".talk-line")).not.toHaveText(news);
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();
    await expect(page.locator("#menu")).not.toHaveAttribute("open", "");
    expect(await page.evaluate(() => ({ talking: window.pellagos.game.battle.actor("barkeep").talkingTo, remembered: window.pellagos.game.memory.barkeep.talks }))).toEqual({ talking: null, remembered: 1 });
});

test("a building gone into is marked on the minimap; holding the minimap opens the world map, fog over all but where the player's been", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Nothing marked yet; into Wenches and Ale and out again, then a walk out of town
    const found = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const before = { icons: game.icons().length, chunks: game.explored.chunksVisited };

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });

        for (const map of ["taproom", "town"]) {
            game.battle.command("player", { type: "enter", link: "tavern-door" });

            for (let k = 0; k < 200 && player.map !== map; k++) {
                game.advance(0.25, { render: false });
            }
        }

        game.minimap.drawn = -Infinity;
        game.advance(0.1);

        const marked = { icons: game.icons().map(({ kind }) => kind), minimap: [...game.minimap.icons], entered: [...game.explored.entered] };

        // (Somewhere 150 metres off that can be walked to)
        const squares = game.world.maps.town.squares;
        const [px, py] = player.square;

        for (let k = 0; k < 16 && !player.path.length; k++) {
            const to = [Math.round(px + Math.cos((k * Math.PI) / 8) * 150), Math.round(py + Math.sin((k * Math.PI) / 8) * 150)];

            if (!squares.blocked(...to)) {
                game.battle.command("player", { type: "move", to, run: true });
                game.advance(0.1, { render: false });
            }
        }

        for (let k = 0; k < 120; k++) {
            game.advance(0.5, { render: false });
        }

        return { before, marked, chunks: game.explored.chunksVisited, map: player.map };
    });

    expect(found.before).toEqual({ icons: 0, chunks: 1 });
    expect(found.marked).toEqual({ icons: ["tavern"], minimap: ["tavern"], entered: ["home:tavern"] });
    expect(found.chunks).toBeGreaterThanOrEqual(3);

    // Held (not tapped): the world map, the game paused under it
    await page.evaluate(() => window.pellagos.game.start());

    const box = await page.locator("#minimap").boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
    await page.waitForFunction(() => window.pellagos.worldMap?.drawn, null, { polling: 100 });

    const map = await page.evaluate(() => {
        const { game, worldMap } = window.pellagos;

        return { open: document.querySelector("#worldmap").open, running: game.running, order: game.battle.actor("player").order?.type ?? null, drawn: worldMap.drawn, chunks: game.explored.chunksVisited, town: game.world.plan.places.find(({ at }) => Math.hypot(at[0] - game.world.stamp.middle[0], at[1] - game.world.stamp.middle[1]) < 200)?.name };
    });

    expect(map.open).toBe(true);
    expect(map.running).toBe(false);
    expect(map.order).toBeNull();
    expect(map.drawn.fogged).toBe(128 * 128 - map.chunks);
    expect(map.drawn.chunks.length).toBe(map.chunks);
    expect(map.drawn.icons).toEqual(["tavern"]);
    expect(map.drawn.names).toContain(map.town);
    await expect(page.getByRole("heading", { name: "The world" })).toBeVisible();
    await expect(page.locator("#worldmapkey li")).toHaveCount(5);

    // Zoomed right out, the whole world under its fog; Escape closes it and the game goes on
    await page.locator("#worldmapout").click();
    await page.locator("#worldmapout").click();

    expect(await page.evaluate(() => window.pellagos.worldMap.view.scale)).toBeGreaterThan(3);
    await page.keyboard.press("Escape");
    await expect(page.locator("#worldmap")).not.toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);

    // M opens it too, and closes it again
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).toBeVisible();
    await page.keyboard.press("m");
    await expect(page.locator("#worldmap")).not.toBeVisible();
    expect(await page.evaluate(() => window.pellagos.game.running)).toBe(true);
});

test("the minimap walks the player where it's tapped, and Game options turn it and the sound off, remembered", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const minimap = page.locator("#minimap");

    await expect(minimap).toBeVisible();

    // Ten metres south of the player, on the map (which shows the world round them)
    const box = await minimap.boundingBox();
    const spot = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [x0, z0, across] = game.minimap.shown();

        return { x: player.x, z: player.y + 10, x0, z0, across };
    });

    await page.mouse.click(box.x + ((spot.x - spot.x0) / spot.across) * box.width, box.y + ((spot.z - spot.z0) / spot.across) * box.height);

    const walked = await page.evaluate(() => ({ order: window.pellagos.game.battle.actor("player").order, sound: window.pellagos.session.sound.playing }));

    expect(walked.order.type).toBe("move");
    expect(Math.abs(walked.order.to[0] + 0.5 - spot.x)).toBeLessThan(3);
    expect(Math.abs(walked.order.to[1] + 0.5 - spot.z)).toBeLessThan(3);
    expect(walked.sound).toBe(true);

    // Menu, Game options: both on; turn them off
    await page.locator("#menubutton").click();
    await page.getByRole("button", { name: "Game options" }).click();

    const minimapSwitch = page.getByRole("switch", { name: /Minimap/ });
    const soundSwitch = page.getByRole("switch", { name: /Sound/ });

    await expect(minimapSwitch).toBeChecked();
    await expect(soundSwitch).toBeChecked();

    // Each kind of sound has its slider: effects, environment and music (soft to start with)
    await expect(page.locator("#effectsvolume")).toHaveValue("50");
    await expect(page.locator("#environmentvolume")).toHaveValue("40");
    await expect(page.locator("#musicvolume")).toHaveValue("35");
    await page.locator("#musicvolume").fill("60");
    await page.locator("#musicvolume").dispatchEvent("change");
    await expect(page.locator("output[for=musicvolume]")).toHaveText("60%");
    expect(await page.evaluate(() => window.pellagos.session.sound.volumes.music)).toBe(0.6);

    await page.locator("label:has(#minimapswitch)").click();
    await page.locator("label:has(#soundswitch)").click();
    await expect(minimapSwitch).not.toBeChecked();
    await expect(soundSwitch).not.toBeChecked();
    await expect(page.locator("#musicvolume")).toBeDisabled();
    await page.getByRole("button", { name: "Back" }).click();
    await page.getByRole("button", { name: "Resume" }).click();
    await expect(minimap).toBeHidden();
    expect(await page.evaluate(() => window.pellagos.session.sound.playing)).toBe(false);

    // Remembered next time
    await playing(page, "/?play&seed=1");
    await expect(minimap).toBeHidden();
    expect(await page.evaluate(() => ({ enabled: window.pellagos.session.sound.enabled, music: window.pellagos.session.sound.volumes.music }))).toEqual({ enabled: false, music: 0.6 });
    await expect(page.locator("#musicvolume")).toHaveValue("60");
});

test("holding on an enemy or the player opens the action wheel: flick up to stun it, or to heal", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".wheel");
    const up = wheel.locator('.slice[data-direction="up"]');

    // The orc standing a few squares from the player, who's hurt
    const orcAt = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;
        const player = battle.actor("player");
        const orc = battle.actor("orc");
        const square = [player.square[0] + 3, player.square[1] - 2];

        Object.assign(orc, { square, x: square[0] + 0.5, y: square[1] + 0.5, to: null, path: [], ai: null });
        game.avatars.get("orc").place(orc.x, orc.y, Math.PI);
        game.previous.set("orc", { x: orc.x, y: orc.y });
        player.hp = 20;
        game.advance(0.1);

        return session.view.toScreen(game.avatars.get("orc").point(0.5));
    });
    const hold = async ({ x, y }) => {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await expect(wheel).toBeVisible();
    };
    const flickUp = async ({ x, y }) => {
        await page.mouse.move(x, y - 25, { steps: 2 });
        await page.mouse.move(x, y - 60, { steps: 2 });
    };
    // Play on without drawing, then carry on
    const playOn = (seconds) => page.evaluate((seconds) => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(seconds);
        game.start();
    }, seconds);

    // Held on the orc: its wheel, with Stun at the top
    await hold(orcAt);
    await expect(up.locator(".label")).toHaveText("Stun");
    await expect(wheel.locator(".slice.empty")).toHaveCount(3);
    await flickUp(orcAt);
    await page.mouse.up();
    await playOn(0.6);

    const stunned = await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        return { stunned: battle.actor("orc").stunnedUntil > battle.time, cooldown: battle.cooldown("player") };
    });

    expect(stunned.stunned).toBe(true);
    expect(stunned.cooldown).toBeGreaterThan(0.5);

    // Held on the player while spells cool down: Heal greyed over, and a flick at it refused. (The
    // game plays on in real time meanwhile, so the cooldown's started again, not to run out first.)
    const meAt = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;

        battle.actor("player").spellReadyAt = battle.time + 3000;

        return session.view.toScreen(game.avatars.get("player").point(0.5));
    });

    await hold(meAt);
    await expect(up.locator(".label")).toHaveText("Heal");
    await expect(up).toHaveClass(/cooling/);
    expect(await up.locator(".cooldown").getAttribute("d")).not.toBe("");
    await flickUp(meAt);
    await expect(up).toHaveClass(/refused/);
    await page.mouse.up();
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").casting)).toBeNull();

    // Once it's over, the flick heals, by 10 to 20
    await playOn(3);
    await hold(meAt);
    await expect(up).not.toHaveClass(/cooling/);
    await flickUp(meAt);
    await page.mouse.up();
    await playOn(1);

    const hp = await page.evaluate(() => window.pellagos.game.battle.actor("player").hp);

    expect(hp).toBeGreaterThanOrEqual(30);
    expect(hp).toBeLessThanOrEqual(40);
});

test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("fits the screen: the title, making a character and the game's buttons", async ({ page }) => {
        await title(page);

        const card = await page.locator(".title").boundingBox();

        expect(card.x).toBeGreaterThanOrEqual(0);
        expect(card.x + card.width).toBeLessThanOrEqual(390);

        await page.getByRole("button", { name: "New character" }).tap();
        await expect(page.locator("#create")).toBeVisible();

        // The maker sits below the character, across the whole width
        const maker = await page.locator(".creator").boundingBox();

        expect(maker.y).toBeGreaterThan(300);
        expect(maker.width).toBeGreaterThan(350);

        await page.goto("/?play&seed=1");
        await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });

        for (const button of ["#menubutton", "#zoomin", "#zoomout"]) {
            const box = await page.locator(button).boundingBox();

            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.x + box.width).toBeLessThanOrEqual(390);
        }

        // The hint fits across the screen, clear of the zoom buttons
        const hint = await page.locator("#hint").boundingBox();
        const zoom = await page.locator("#zoomout").boundingBox();

        expect(hint.x).toBeGreaterThanOrEqual(0);
        expect(hint.x + hint.width).toBeLessThanOrEqual(zoom.x);

        // The player's name and health in the bottom left corner, beside the zoom buttons and
        // under the hint, with room above it for the stamina bar
        const plate = await page.locator("#playerplate").boundingBox();

        expect(plate.x).toBeLessThan(30);
        expect(plate.y + plate.height).toBeGreaterThan(844 - 30);
        expect(plate.y + plate.height).toBeLessThanOrEqual(844);
        expect(plate.x + plate.width).toBeLessThanOrEqual(zoom.x);
        expect(hint.y + hint.height).toBeLessThanOrEqual(plate.y - 20);
    });

    test("runs where the ground is double-tapped", async ({ page }) => {
        await playing(page, "/?play&seed=1");

        await doubleTap(page, await spotNorth(page, 4), { touch: true });

        expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").order?.run)).toBe(true);
    });
});
