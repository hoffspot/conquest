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

async function playing(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.pellagos?.playing, null, { timeout: 90000 });
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
    await expect(page.locator("#loadlist li")).toHaveCount(6);
    await expect(page.locator("#loadlist")).toContainText("3D engine");
    await expect(page.locator("#loadlist")).toContainText("Lettering");
    await expect(page.locator("#title")).toBeVisible({ timeout: 60000 });
    await expect(page.locator("#titlename")).toHaveText("Pellagos");
    await expect(page.locator("#continuebutton")).toBeHidden();

    const loaded = await page.evaluate(() => ({ loaded: window.pellagos.loader.loaded, total: window.pellagos.loader.total, groups: window.pellagos.loader.groups.map((group) => group.done === group.files.length) }));

    expect(loaded.loaded).toBe(loaded.total);
    expect(loaded.total).toBeGreaterThan(2_000_000);
    expect(loaded.groups).toEqual([true, true, true, true, true, true]);
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

    // A weapon: every starting weapon is offered; the bow comes with a quiver
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await expect(page.locator(".weapon")).toHaveCount(7);
    await page.locator('[data-weapon="bow"]').click();
    await page.waitForFunction(() => window.pellagos.creator.avatar.character.items.some((item) => item.name === "bow"));
    expect(await page.evaluate(() => window.pellagos.creator.avatar.character.items.map((item) => item.name))).toEqual(expect.arrayContaining(["bow", "quiver"]));

    // A name
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("  Tamsin  Rowe ");
    await expect(page.locator("#namesummary")).toContainText("Tamsin Rowe, with a bow");
    await page.getByRole("button", { name: "Begin" }).click();

    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#playerplate .name")).toHaveText("Tamsin Rowe");

    const game = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const { square } = game.world.town;

        return {
            weapon: player.weapon,
            equipment: [...game.avatars.get("player").character.equipment.values()],
            inSquare: player.x >= game.world.origin + square.x * 4 && player.x <= game.world.origin + (square.x + square.w) * 4 && player.y >= game.world.origin + square.y * 4 && player.y <= game.world.origin + (square.y + square.h) * 4,
            saved: JSON.parse(localStorage.getItem("pellagos.save")),
        };
    });

    expect(game.weapon).toBe("bow");
    expect(game.equipment).toEqual(expect.arrayContaining(["tunic", "bracers", "breeches", "boots", "bow", "quiver"]));
    expect(game.inSquare).toBe(true);
    expect(game.saved.hero.name).toBe("Tamsin Rowe");
    expect(game.saved.hero.weapon).toBe("bow");
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

test("the player and the orc fight when in reach, until one falls", async ({ page }) => {
    await playing(page, "/?play&seed=1&weapon=sword");

    const fight = await page.evaluate(() => {
        const { game } = window.pellagos;
        const events = [];

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

        return {
            attacks: [...new Set(events.filter((event) => event.type === "attack").map((event) => `${event.id}:${event.attack}`))],
            hits: events.filter((event) => event.type === "hit").length,
            dead: events.filter((event) => event.type === "death").map((event) => event.id),
            damageShown: document.querySelectorAll("#floaters .damage").length,
            orcHp: orc.hp,
        };
    });

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
            game.advance(0.5);
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
            game.advance(0.5);
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
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const order = player.order;

        game.stop();
        game.advance(1.5);

        const avatar = game.avatars.get("player");

        return { order, running: player.running, pace: player.pace, x: avatar.object.position.x, z: avatar.object.position.z };
    });

    expect(moved.order?.type).toBe("move");
    expect(moved.order.run).toBe(true);
    expect(moved.running).toBe(true);

    // The way they faced
    const along = (moved.x - start.x) * Math.sin(start.facing) + (moved.z - start.z) * Math.cos(start.facing);
    const across = Math.abs((moved.x - start.x) * Math.cos(start.facing) - (moved.z - start.z) * Math.sin(start.facing));

    expect(along).toBeGreaterThan(3);
    expect(across).toBeLessThan(1);
});

test("the camera keeps still while the player moves about the middle, then follows them from behind", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const camera = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const avatar = game.avatars.get("player");
        const spot = (dx, dz) => view.toScreen(avatar.object.position.clone().add({ x: dx, y: 0, z: dz }));
        const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

        game.stop();

        // A step within the middle of the screen: the camera keeps still
        const still = { x: view.focus.x, z: view.focus.z, yaw: view.yaw };
        const near = spot(1, 0);

        game.tap(near.x, near.y);
        game.advance(2);

        const afterStep = { x: view.focus.x, z: view.focus.z, yaw: view.yaw };

        // A long walk east: out of the middle, and the camera turns round behind the player
        const far = spot(12, 0);

        game.tap(far.x, far.y);
        game.advance(2.5);

        const from = avatar.object.position.clone();

        game.advance(1.5);

        const heading = avatar.object.position.clone().sub(from);
        const behind = Math.atan2(-heading.x, -heading.z);
        const onScreen = view.fromMiddle(avatar.point(0.55));

        return { still, afterStep, yaw: view.yaw, off: Math.abs(wrap(view.yaw - behind)), walked: heading.length(), onScreen };
    });

    expect(camera.afterStep).toEqual(camera.still);
    expect(camera.still.yaw).toBe(0);
    expect(camera.walked).toBeGreaterThan(1.5);
    expect(Math.abs(camera.yaw)).toBeGreaterThan(0.8);
    expect(camera.off).toBeLessThan(0.5);
    expect(Math.abs(camera.onScreen.x)).toBeLessThan(0.34);
    expect(Math.abs(camera.onScreen.y)).toBeLessThan(0.34);
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
            game.advance(0.05);
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

test("tapping the tavern's door lights its edge green, and the player walks in: inside the door, facing the room; up the stairs, down, and out", async ({ page }) => {
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

    // Outside the door, the orc out of the way
    const outside = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "move", to: game.world.tavern.outside });
        game.advance(25);

        return { square: game.battle.actor("player").square, outside: game.world.tavern.outside, inside: game.world.maps.taproom.marks.D[0], top: game.world.maps.upstairs.marks[">"][0] };
    });

    expect(outside.square).toEqual(outside.outside);

    const inside = await through("town", "door", 5);

    expect(inside).toEqual({ order: "enter", glowing: true, map: "taproom", shown: "taproom", square: outside.inside, facing: Math.PI, minimap: "taproom", heard: "taproom" });
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
            game.advance(0.25);

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

    expect(up).toMatchObject({ order: "enter", glowing: true, map: "upstairs", shown: "upstairs", square: outside.top, minimap: "upstairs", heard: "upstairs" });
    expect(await page.evaluate(() => window.pellagos.game.avatars.get("madam").object.visible)).toBe(true);

    // (Standing at their top, straight down)
    const down = await through("upstairs", "stairs", 3);

    expect(down).toMatchObject({ map: "taproom", shown: "taproom", square: [0, 0] });

    // And out, onto the square outside the door
    const out = await through("taproom", "door", 14);

    expect(out).toMatchObject({ order: "enter", map: "town", shown: "town", square: outside.outside, minimap: "town", heard: "town" });
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

test("the minimap walks the player where it's tapped, and Game options turn it and the sound off, remembered", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const minimap = page.locator("#minimap");

    await expect(minimap).toBeVisible();

    // Ten metres south of the player, on the map
    const box = await minimap.boundingBox();
    const spot = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return { x: player.x, z: player.y + 10, width: game.world.width, height: game.world.height };
    });

    await page.mouse.click(box.x + (spot.x / spot.width) * box.width, box.y + (spot.z / spot.height) * box.height);

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
