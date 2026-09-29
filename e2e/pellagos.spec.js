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

test("makes a character of another people: a cat folk's ears, tail and fur, their colours, random as one of them; played, they wake in a town of their people's, as one of them", async ({ page }) => {
    test.setTimeout(180000);
    await title(page);
    await page.getByRole("button", { name: "New character" }).click();
    await page.waitForFunction(() => window.pellagos.creator?.avatar);

    // The peoples to choose from: humans to start with
    const peoples = page.getByRole("radiogroup", { name: "People" });

    await expect(peoples.getByRole("radio")).toHaveText(["Human", "Elf", "Dark elf", "Cat folk", "Lizard folk", "Orc"]);
    await expect(peoples.getByRole("radio", { name: "Human" })).toHaveAttribute("aria-checked", "true");

    // Cat folk: their ears and tail on, furred, their colours to choose from
    await peoples.getByRole("radio", { name: "Cat folk" }).click();
    await expect(page.getByRole("radiogroup", { name: "People" }).getByRole("radio", { name: "Cat folk" })).toHaveAttribute("aria-checked", "true");
    await page.waitForFunction(() => [...window.pellagos.creator.avatar.character.equipment.values()].includes("catTail"));

    const cat = await page.evaluate(() => {
        const { creator } = window.pellagos;

        return { race: creator.hero.race, parts: creator.hero.parts, fur: creator.hero.look.skin.fur, equipment: [...creator.avatar.character.equipment.values()] };
    });

    expect(cat.race).toBe("cat");
    expect(cat.parts).toEqual(["catEars", "catTail"]);
    expect(cat.fur).toBeGreaterThan(0.5);
    expect(cat.equipment).toEqual(expect.arrayContaining(["catEars", "catTail"]));

    await page.getByRole("tab", { name: "Colours & hair" }).click();
    await expect(page.getByRole("radiogroup", { name: "Tone" }).getByRole("radio")).toHaveCount(6);

    // Random: another of them
    await page.getByRole("button", { name: "Random" }).click();
    expect(await page.evaluate(() => [window.pellagos.creator.hero.race, window.pellagos.creator.hero.parts])).toEqual(["cat", ["catEars", "catTail"]]);

    // Named, and played: in a town of theirs, of their people, their ears and tail on
    await page.getByRole("button", { name: "Next: weapon" }).click();
    await page.getByRole("button", { name: "Next: name" }).click();
    await page.locator("#nameinput").fill("Mirra");
    await page.getByRole("button", { name: "Begin" }).click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const played = await page.evaluate(() => {
        const { game } = window.pellagos;

        return { start: game.world.start.race, team: game.battle.actor("player").team, realm: game.self.realm, equipment: [...game.avatars.get("player").character.equipment.values()], saved: JSON.parse(localStorage.getItem("pellagos.save")).hero.race };
    });

    expect(played).toEqual({ start: "cat", team: "cat", realm: "cat", equipment: expect.arrayContaining(["catEars", "catTail"]), saved: "cat" });
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
        battle.cast(standing.id, "vigor");
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
    expect(moved.pitch).toBe(35);
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
    expect(camera.start.pitch).toBe(35);
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

test("dragged up, the camera looks up into the sky (clouds and the sun in it, birds flying by), and walking, it looks down again", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const sky = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { view } = session;
        const player = game.battle.actor("player");
        const me = game.avatars.get(game.me).object.position;

        game.stop();

        // (Tilted up as far as it goes)
        game.cameraFollow.turn(0, -120, view.lowestPitch());
        game.flyers.send("crow", { x: me.x, z: me.z });
        game.advance(1);

        const looking = view.camera.getWorldDirection(view.camera.position.clone());
        const up = { pitch: view.pitch, lowest: view.lowestPitch(), height: view.camera.position.y, looking: looking.y, sky: view.sky.object.visible && view.scene.children.includes(view.sky.object), birds: game.flyers.counts.birds, drawn: game.flyers.meshes.get("crow").count };

        // Walking again: looking down to see where they go
        game.battle.command("player", { type: "move", to: [player.square[0], player.square[1] - 6] });
        game.advance(2.5);

        return { up, walking: view.pitch };
    });

    expect(sky.up.lowest).toBe(-45);
    expect(sky.up.pitch).toBe(-45);
    expect(sky.up.height).toBeGreaterThan(0.3);
    expect(sky.up.looking).toBeGreaterThan(0.5);
    expect(sky.up.sky).toBe(true);
    expect(sky.up.birds).toBeGreaterThan(0);
    expect(sky.up.drawn).toBe(sky.up.birds);
    expect(sky.walking).toBeGreaterThanOrEqual(15);
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

test("walks out of the town into the world, drawn round the player as they go, with no loading; the wild's creatures about them there", async ({ page }) => {
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

        // (The creatures put out lately drawn a few at a time: all of them, given a moment)
        for (let k = 0; k < 20 && game.enlisting.length; k++) {
            game.advance(0.25);
        }

        const [cx, cy] = [Math.floor(player.x / 64), Math.floor(player.y / 64)];
        const [x0, z0, across] = game.minimap.shown();
        const round = [];

        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                round.push(game.chunks.drawn.has(key(cx + dx, cy + dy)));
            }
        }

        // (The wild's creatures about them out here, each drawn as its kind looks)
        const beasts = [...game.host.wild.keys()].map((id) => game.battle.actor(id)).filter((actor) => actor && !actor.dead);

        return {
            arrived: Math.hypot(player.x - goal[0] - 0.5, player.y - goal[1] - 0.5) < 1.5,
            outside: !world.inTown(Math.floor(player.x), Math.floor(player.y)),
            round,
            near: [...game.chunks.drawn.values()].every((drawn) => Math.max(Math.abs(drawn.cx - cx), Math.abs(drawn.cy - cy)) <= 3),
            dropped: before.filter((drawn) => !game.chunks.drawn.has(drawn)).length,
            mapped: player.x > x0 && player.x < x0 + across && player.y > z0 && player.y < z0 + across,
            beasts: beasts.length,
            drawn: beasts.filter((actor) => game.avatars.has(actor.id)).length,
            kinds: beasts.every((actor) => actor.kind === "beast" && actor.wild?.creature),
        };
    });

    expect(trip.arrived).toBe(true);
    expect(trip.outside).toBe(true);
    expect(trip.round).toEqual(Array(25).fill(true));
    expect(trip.near).toBe(true);
    expect(trip.dropped).toBeGreaterThan(0);
    expect(trip.mapped).toBe(true);
    expect(trip.beasts).toBeGreaterThan(0);
    expect(trip.drawn).toBe(trip.beasts);
    expect(trip.kinds).toBe(true);
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

test("tapping the ground walks the player there; double-clicking it runs there, using stamina, shown by an orange bar until it's back", async ({ page }) => {
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

    // A spot a few metres north of the player tapped: they walk there
    const walked = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");
        const start = [player.x, player.y];
        const avatar = game.avatars.get("player");
        const spot = session.view.toScreen(avatar.object.position.clone().setZ(avatar.object.position.z - 3));

        game.stop();
        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });
        game.advance(4);

        return { start, end: [player.x, player.y] };
    });

    expect(walked.end[1]).toBeLessThan(walked.start[1] - 2);
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
    // walk them there, and don't take them back through. (Looking down more steeply than the
    // camera starts, so no one sitting at a table nearby is in the way of the ground tapped:
    // tapping them talks to them)
    const tapsRound = () => page.evaluate(() => {
        const { game, session } = window.pellagos;
        const avatar = game.avatars.get("player");
        const orders = [];

        game.cameraFollow.pitch = 45;
        game.advance(0.1);

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

test("the town's guards stand at its ways out under its people's banner, and talk of the town and the war; a people at war with the player's attacks them", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // Out as soon as the game's played: guards at the roads out, a patrol going round, a banner by each road
    const out = await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.advance(1.5, { render: false });

        const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

        return {
            soldiers: soldiers.map(({ id, team, name, weapon }) => ({ id, team, name, weapon, drawn: game.avatars.has(id) })),
            banners: game.banners.group.children.length,
            town: game.host.war.town(game.world.start.id).name,
        };
    });

    expect(out.soldiers.length).toBeGreaterThanOrEqual(5);
    expect(out.soldiers.every(({ team, drawn }) => team === "human" && drawn)).toBe(true);
    expect(out.soldiers.map(({ name }) => name)).toContain("Human guard");
    expect(out.soldiers.map(({ name }) => name)).toContain("Human patrol");
    expect(out.banners).toBeGreaterThanOrEqual(1);

    // Tapping a guard: the player walks up to talk to them, and they tell of their town
    const guard = out.soldiers.find(({ id }) => id.endsWith("/guard-0"));
    const tapped = await page.evaluate((id) => {
        const { game, session } = window.pellagos;
        const soldier = game.battle.actor(id);
        const player = game.battle.actor("player");

        // (A few steps out in front of them: they face out of the town)
        const [x, y] = [soldier.square[0] + Math.round(Math.sin(soldier.post) * 4), soldier.square[1] + Math.round(Math.cos(soldier.post) * 4)];

        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [], order: null });
        game.avatars.get("player").place(x + 0.5, y + 0.5, player.facing);
        game.previous.set("player", { x: player.x, y: player.y });
        game.advance(0.5);

        const spot = session.view.toScreen(game.avatars.get(id).point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });

        const order = player.order?.type ?? null;

        game.advance(6);

        return { order, talking: soldier.talkingTo };
    }, guard.id);

    expect(tapped).toEqual({ order: "approach", talking: "player" });

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText("Human guard");
    await expect(talk.locator(".talk-title")).toHaveText(`Of the guard of ${out.town}`);
    await talk.getByRole("button", { name: /Who holds this place/ }).click();
    await expect(talk.locator(".talk-line")).toContainText(`${out.town} is ours: the Humans hold it`);
    await talk.getByRole("button", { name: /How goes the war/ }).click();
    await expect(talk.locator(".talk-line")).toContainText(/an uneasy peace/i);
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();

    // Taken by the orcs, at war with the humans: orcish soldiers now, under their banner, and they come for the player
    const war = await page.evaluate(() => {
        const { game } = window.pellagos;
        const { war } = game.host;

        game.stop();
        const home = war.town(game.world.start.id);

        home.owner = "orc";
        war.known.push("human|orc");
        war.relations["human|orc"] = { state: "hostile", since: war.turn };
        game.host.lookAt = 0;

        const player = game.battle.actor("player");
        let [after, hurt, plates] = [false, false, 0];

        for (let k = 0; k < 60 && !hurt; k++) {
            game.advance(0.1, { render: false });

            const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

            after ||= soldiers.some(({ target }) => target === "player");
            hurt ||= player.hp < player.maxHp || player.dead;
            plates = Math.max(plates, soldiers.filter(({ id }) => game.hud.tracked.has(id)).length);
        }

        const soldiers = game.battle.actors.filter(({ kind }) => kind === "soldier");

        return { teams: [...new Set(soldiers.map(({ team }) => team))], banner: game.banners.towns.get(home.id)?.people, after, hurt, plates };
    });

    expect(war.teams).toEqual(["orc"]);
    expect(war.banner).toBe("orc");
    expect(war.after).toBe(true);
    expect(war.hurt).toBe(true);
    expect(war.plates).toBeGreaterThan(0);
});

test("an enemy camp near the player is pitched, tents, fire, banner and sentries; its raiders come for the town's fields, and the player's told", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orc camp just outside the town, at war with the humans; the player by it
    const camp = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const home = war.town(game.world.start.id);
        const [mx, my] = game.world.stamp.middle;
        const at = [mx + 110, my + 5];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.stage = 3;
        war.forces.push({ id: "force-900", realm: "orc", kind: "camp", size: 20, at, path: [at], leg: 0, target: home.id, home: war.realm("orc").capital, mission: null, about: null, since: 1000, sortie: null });
        Object.assign(player, { square: [Math.floor(at[0] - 3), Math.floor(at[1] + 10)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(1.5);

        const sentries = game.host.camps.get("force-900")?.ids ?? [];

        return {
            drawn: game.camps.size,
            tents: game.camps.camps.get("force-900")?.object.children.length ?? 0,
            banner: game.banners.group.children.some(({ name }) => name === "banner:camp:force-900"),
            sentries: sentries.map((id) => ({ name: game.battle.actor(id).name, drawn: game.avatars.has(id), hostile: game.battle.hostile(game.battle.actor(id), player) })),
        };
    });

    expect(camp.drawn).toBe(1);
    expect(camp.tents).toBeGreaterThan(5);
    expect(camp.banner).toBe(true);
    expect(camp.sentries.length).toBe(6);
    expect(camp.sentries.every(({ name, hostile }) => name === "Orcish sentry" && hostile)).toBe(true);
    expect(camp.sentries.some(({ drawn }) => drawn)).toBe(true);

    // A raid, sooner or later: its raiders drawn, and the player told
    const raid = await page.evaluate(() => {
        const { game } = window.pellagos;

        for (let turn = 0; turn < 30 && !game.host.sorties.size; turn++) {
            game.advance(60, { render: false });
        }

        game.advance(1);

        const sortie = game.host.sorties.get("force-900");

        return sortie && { kind: sortie.kind, raiders: sortie.ids.map((id) => ({ name: game.battle.actor(id).name, drawn: game.avatars.has(id) })) };
    });

    expect(raid.kind).toBe("raid");
    expect(raid.raiders.every(({ name }) => name === "Orcish raider")).toBe(true);
    expect(raid.raiders.some(({ drawn }) => drawn)).toBe(true);
    await expect(page.locator("#banner")).toContainText("Raiders of the Orcs are coming for");

    // Far off: the camp struck, its tents down
    const struck = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [mx, my] = game.world.stamp.middle;

        Object.assign(player, { square: [Math.floor(mx - 250), Math.floor(my)], x: Math.floor(mx - 250) + 0.5, y: Math.floor(my) + 0.5, to: null, path: [] });
        game.advance(1.5);

        return { drawn: game.camps.size, pitched: game.host.camps.size };
    });

    expect(struck).toEqual({ drawn: 0, pitched: 0 });
});

test("an envoy on the road near the player goes by with their escort; struck down, they're waylaid, and the journal tells of the grudge", async ({ page }) => {
    await playing(page, "/?play&seed=2");

    // An orcish envoy on the road just outside the town, at war with the humans; the player by them
    const met = await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;
        const [mx, my] = game.world.stamp.middle;
        const at = [mx + 90, my + 5];
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.relations["human|orc"] = { state: "hostile", since: 0 };
        war.forces.push({ id: "force-950", realm: "orc", kind: "envoy", size: 0, at: [...at], path: [at, [at[0] + 100, at[1]], [at[0] + 200, at[1]]], leg: 0, target: "elf", home: war.realm("orc").capital, mission: "alliance", about: null, since: war.turn });
        Object.assign(player, { square: [Math.floor(at[0] - 4), Math.floor(at[1] + 3)], to: null, path: [], hp: 5000, maxHp: 5000 });
        Object.assign(player, { x: player.square[0] + 0.5, y: player.square[1] + 0.5 });
        game.advance(1.5);

        const party = game.host.envoys.get("force-950")?.ids ?? [];

        return party.map((id) => ({ id, name: game.battle.actor(id).name, drawn: game.avatars.has(id) }));
    });

    expect(met.map(({ name }) => name)).toEqual(["Orcish envoy", "Orcish escort", "Orcish escort"]);
    expect(met.some(({ drawn }) => drawn)).toBe(true);

    // Struck down: waylaid, and the player told
    const fell = await page.evaluate((id) => {
        const { game } = window.pellagos;
        const envoy = game.battle.actor(id);
        const player = game.battle.actor("player");

        envoy.hp = 1;
        Object.assign(player, { square: [envoy.square[0] + 1, envoy.square[1]], x: envoy.square[0] + 1.5, y: envoy.square[1] + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "engage", target: id });

        for (let k = 0; k < 20 && game.host.war.force("force-950"); k++) {
            game.advance(1);
        }

        game.start();

        return { gone: !game.host.war.force("force-950"), grudge: game.host.war.realm("orc").standing.human ?? 0 };
    }, met[0].id);

    expect(fell.gone).toBe(true);
    expect(fell.grudge).toBeLessThan(-5);
    await expect(page.locator("#banner")).toContainText("envoy to the Elves has been struck down by the Humans");

    // The journal: the orcs bear the humans a grudge
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-regard.grudge")).toContainText(["The Orcs bear you"]);
    await page.keyboard.press("Escape");
});

test("an adventurer at the guild, hired for gold, follows the player out and keeps up; the journal shows their company, and they're with them the next time", async ({ page }) => {
    // (Played twice: more than the usual time)
    test.setTimeout(180000);

    // A saved game in seed 2's world
    await page.addInitScript((save) => localStorage.setItem("pellagos.save", JSON.stringify(save)), { ...SAVE, seed: 2 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // Into the guild with gold to spare, and up to one of its adventurers
    const guild = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = [...game.world.interiors.buildings.values()].find((each) => each.kind === "guild");
        const player = game.battle.actor("player");
        const [x, y] = building.door.ends[0].squares[0];

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.progress.gold = 200;
        Object.assign(player, { square: [x, y], x: x + 0.5, y: y + 0.5, to: null, path: [] });
        game.battle.command("player", { type: "enter", link: building.door.id });
        game.advance(0.3);

        const adventurer = game.battle.actors.find((actor) => actor.map === player.map && actor.role === "adventurer");

        game.approaching = adventurer.id;
        game.battle.command("player", { type: "approach", target: adventurer.id });

        for (let k = 0; k < 200 && !game.talking; k++) {
            game.advance(0.1, { render: false });
        }

        game.start();

        return { name: adventurer.name, door: building.door.id };
    });
    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(guild.name);

    // Asked to ride along, for their price: paid, and they follow
    const ask = talk.getByRole("button", { name: /Would you ride with me\? \(\d+ gold\)$/ });
    const price = Number((await ask.textContent()).match(/(\d+) gold/)[1]);

    await ask.click();
    await expect(talk.locator(".talk-line")).toContainText(/Lead on|Where to\?|killed/);
    await expect(page.locator("#banner")).toHaveText(`${guild.name} follows you now.`);
    await expect(page.locator(".coins").first()).toHaveText(`${200 - price} gold`);
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();

    // Out of the guild: they come out with the player, and keep up on a walk down the street
    const out = await page.evaluate((door) => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");
        const [id] = [...game.host.followers].find(([, { leader }]) => leader === "player");
        const follower = game.battle.actor(id);
        const apart = () => Math.hypot(follower.x - player.x, follower.y - player.y);

        game.stop();
        game.battle.command("player", { type: "enter", link: door });

        for (let k = 0; k < 100 && player.map !== "town"; k++) {
            game.advance(0.1, { render: false });
        }

        game.advance(0.5, { render: false });

        const outside = { map: follower.map, apart: apart(), drawn: game.avatars.has(id) };
        const start = [...player.square];

        game.battle.command("player", { type: "move", to: game.world.tavern.outside });

        for (let k = 0; k < 300 && (player.path.length || player.to); k++) {
            game.advance(0.1, { render: false });
        }

        game.advance(3, { render: false });
        game.start();

        return { outside, walked: Math.hypot(player.square[0] - start[0], player.square[1] - start[1]), after: { map: follower.map, apart: apart() }, id };
    }, guild.door);

    expect(out.outside).toEqual({ map: "town", apart: expect.any(Number), drawn: true });
    expect(out.outside.apart).toBeLessThan(6);
    expect(out.walked).toBeGreaterThan(8);
    expect(out.after.map).toBe("town");
    expect(out.after.apart).toBeLessThan(5);

    // The journal: who follows the player, and how they are
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-follower-name")).toHaveText([guild.name]);
    await expect(journal.locator(".journal-follower-state")).toContainText([/^(warrior|ranger|rogue|mage|cleric), 100%$/]);
    await page.keyboard.press("Escape");

    // Kept with the character: with them again the next time
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.followers")));

    expect(kept.followers.map(({ name }) => name)).toEqual([guild.name]);
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    const again = await page.evaluate(() => {
        const { game } = window.pellagos;
        const player = game.battle.actor("player");

        return [...game.host.followers].map(([id, { name, leader }]) => {
            const follower = game.battle.actor(id);

            return { name, leader, map: follower.map, apart: Math.hypot(follower.x - player.x, follower.y - player.y), drawn: game.avatars.has(id) };
        });
    });

    expect(again).toEqual([{ name: guild.name, leader: "player", map: "town", apart: expect.any(Number), drawn: true }]);
    expect(again[0].apart).toBeLessThan(6);
});

test("the player's people brought under another: told, and served; stirred to rising, they rise; and their victory, told and honoured", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const fate = page.locator(".fate");
    const journal = page.getByRole("dialog", { name: "Journal" });

    // Brought under the orcs (as the war tells it): the player's told, and plays on
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const war = game.host.war;

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        war.events.push({ type: "subjugated", turn: war.turn, realm: "human", by: "orc", was: null });
        Object.assign(war.realm("human"), { overlord: "orc", since: war.turn });
        game.advance(0.1, { render: false });
        game.start();
    });
    await expect(fate).toBeVisible();
    await expect(fate.locator(".fate-title")).toHaveText("Brought under");
    await expect(fate.locator(".fate-text")).toContainText("The Humans' seat has fallen, and they bend the knee to the Orcs. You serve them now");
    await fate.getByRole("button", { name: "Play on" }).click();
    await expect(fate).toBeHidden();

    // The journal: whom they serve, and how near they are to rising
    await page.keyboard.press("j");
    await expect(journal.locator(".journal-fate")).toHaveText(/^You serve the Orcs\. Your people are \d+% of the way to rising\.$/);
    await page.keyboard.press("Escape");

    // Stirred to the brim: ready (told in a word), then risen at the war's next turn
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.host.war.stir("human", 100);
        game.advance(0.1, { render: false });
        game.start();
    });
    await expect(page.locator("#banner")).toHaveText("The Humans are ready to rise against the Orcs!");
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(61, { render: false });
        game.start();
    });
    await expect(fate.locator(".fate-title")).toHaveText("Risen!");
    await expect(fate).toHaveAttribute("data-tone", "hope");
    await page.keyboard.press("Escape");
    await expect(fate).toBeHidden();

    // Every other people brought under them: victory, and the rulers' honours
    const points = await page.evaluate(() => {
        const { game } = window.pellagos;
        const before = game.standing.points;

        game.stop();

        for (const realm of game.host.war.realms.filter(({ id }) => id !== "human")) {
            Object.assign(realm, { overlord: "human", since: game.host.war.turn });
        }

        game.advance(61, { render: false });
        game.start();

        return game.standing.points - before;
    });

    expect(points).toBe(200);
    await expect(fate.locator(".fate-title")).toHaveText("Victory");
    await expect(fate).toHaveAttribute("data-tone", "won");
    await fate.getByRole("button", { name: "Play on" }).click();
    await page.keyboard.press("j");
    await expect(journal.locator(".journal-fate")).toHaveText("Your people rule the continent. Every other people serves them.");
    await page.keyboard.press("Escape");

    // Kept with the war
    const kept = await page.evaluate(() => window.pellagos.game.host.war.victor);

    expect(kept).toBe("human");
});

test("tapping someone walks the player up to talk: their name and what they are, what they say, replies that lead on, Escape to stop; the barkeep tells the war's news as it's heard in the town", async ({ page }) => {
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

    // News of a raid on the town, and a war declared far off; the barkeep tapped again
    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const war = game.host.war;
        const home = war.town(game.world.start.id);

        game.stop();
        war.log.push({ type: "raid", turn: war.turn, realm: "orc", town: home.id, owner: home.owner, killed: 2, lost: 1 });
        war.log.push({ type: "declared", turn: war.turn, by: "orc", on: "elf" });

        const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 18000 });
        game.advance(8);
    });
    await expect(talk).toBeVisible();

    // The news, or what's said of a ruler: and asked again, something else, until the news is told
    const line = talk.locator(".talk-line");
    const warNews = /Raiders of the Orcs struck at .+'s fields|The Orcs have declared war on the Elves/;

    await talk.getByRole("button", { name: "What's the word on the war?" }).click();
    await expect(line).toContainText(/Orcs|They say/);

    const heard = [await line.textContent()];

    for (let k = 0; k < 6 && !heard.some((each) => warNews.test(each)); k++) {
        await talk.getByRole("button", { name: "What else is being said?" }).click();
        await expect(line).not.toHaveText(heard.at(-1));
        await expect(line).toContainText(/Orcs|They say/);
        heard.push(await line.textContent());
    }

    expect(heard.some((each) => warNews.test(each)), heard.join(" / ")).toBe(true);
    await page.keyboard.press("Escape");
});

test("the pack's paperdoll: the player drawn among their gear; tapped, a piece says what it does; held, it goes on or comes off; a two-handed weapon greys out the other hand", async ({ page }) => {
    // A saved game whose hero carries a sword, a fine kite shield and an orc's helm, their staff in hand
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            const pack = [{ id: "kiteShield", quality: "fine", affixes: ["sturdy"], bonuses: { armor: 0.02 } }, { id: "sword" }, { id: "helm", people: "orc" }];

            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: {}, gold: 10, pack, gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });
    await page.keyboard.press("i");

    const pack = page.locator(".pack");
    const slot = (id) => pack.locator(`.doll-slot[data-slot="${id}"]`);
    const cell = (item) => pack.locator(`.carried .pack-cell[data-item="${item}"]`);
    const hold = async (locator) => {
        const box = await locator.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(700);
        await page.mouse.up();
    };
    const worn = () => page.evaluate(() => [...window.pellagos.game.avatars.get(window.pellagos.game.me).character.equipment.values()]);

    // The staff in both hands, the other greyed out behind it; the player among their gear; two pages
    await expect(pack.locator(".doll .doll-view")).toBeVisible();
    await expect(slot("mainHand")).toHaveText(/^Weapon\s*Staff$/);
    await expect(slot("offHand")).toHaveClass(/locked/);
    await expect(pack.locator(".pack-page")).toHaveCount(2);

    // Tapped, the shield says what it is and does, and that it can't go on with the staff
    await cell("kiteShield").click();
    await expect(pack.locator(".pack-about .pack-name")).toHaveText("Sturdy kite shield");
    await expect(pack.locator(".pack-about .pack-compare")).toContainText("The weapon in hand takes both hands.");

    // Held, the sword goes on (the staff into the pack), and the other hand's free for the shield
    await hold(cell("sword"));
    await expect(slot("mainHand")).toHaveText(/^Weapon\s*Sword$/);
    await expect(slot("offHand")).not.toHaveClass(/locked/);
    await expect(cell("staff")).toHaveCount(1);
    await hold(cell("kiteShield"));
    await expect(slot("offHand")).toHaveAttribute("aria-label", "Off hand: Sturdy kite shield");
    await expect.poll(worn).toEqual(expect.arrayContaining(["sword", "kiteShield"]));

    // An orc's helm on, counting towards their set; held again, off, back into the pack
    await hold(cell("helm"));
    await expect(slot("head")).toHaveAttribute("aria-label", "Head: Orcish helm");
    await expect(pack.locator(".doll-set")).toContainText("Horde Ironhide: 1 worn");
    await expect.poll(worn).toContain("helm.orc");
    await hold(slot("head"));
    await expect(slot("head")).toHaveClass(/empty/);
    await expect(cell("helm")).toHaveCount(1);
});

test("the pack shows what's grown and carried; a skill ranks up with use; trading with the barkeep, the gold changes hands; all kept for the next time", async ({ page }) => {
    // (A long walk through: more than the usual time, with others running beside it)
    test.setTimeout(180000);

    // A saved game whose hero is a blow from their next rank with the blade, with 30 gold and a draught
    await page.addInitScript((save) => {
        localStorage.setItem("pellagos.save", JSON.stringify(save));

        if (!localStorage.getItem("pellagos.progress")) {
            localStorage.setItem("pellagos.progress", JSON.stringify({ created: save.created, seed: save.seed, skills: { blade: 99 }, gold: 30, pack: [{ id: "potion" }], gear: null }));
        }
    }, { ...SAVE, seed: 1 });
    await title(page);
    await page.locator("#continuebutton").click();
    await page.waitForFunction(() => window.pellagos.playing, null, { timeout: 90000 });

    // I opens the pack: the gold, the draught to use, the staff in hand, each skill untried (its tab)
    const pack = page.locator(".pack");

    await expect(page.locator("#playerplate .coins")).toHaveText("30 gold");
    await page.keyboard.press("i");
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-gold")).toHaveText("30 gold");
    await expect(pack.locator(".carried .pack-cell[data-item]")).toHaveAttribute("aria-label", "Healing draught");
    await expect(pack.locator(".carried .pack-cell")).toHaveCount(20);
    await expect(pack.locator('.gear .pack-worn[data-slot="mainHand"]')).toHaveText(/^Weapon\s*Staff$/);
    await pack.getByRole("tab", { name: "Skills" }).click();
    await expect(pack.locator('.pack-skill[data-tree="blade"] .pack-skill-rank')).toHaveText("Untried (0)");
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A blow at the orc: the blade's first rank, told
    const ranked = await page.evaluate(() => {
        const { game } = window.pellagos;
        const orc = game.battle.actor("orc");
        const player = game.battle.actor("player");

        game.stop();
        Object.assign(player, { x: orc.x, y: orc.y + 2, square: [orc.square[0], orc.square[1] + 2] });
        game.previous.set("player", { x: player.x, y: player.y });
        game.avatars.get("player").place(player.x, player.y, Math.PI);

        for (let step = 0; step < 80 && game.progress.rank("blade") < 1 && !player.dead; step++) {
            game.advance(0.5, { render: false });
        }

        const told = document.querySelector("#banner").textContent;

        Object.assign(orc, { dead: true, respawnAt: Infinity });

        return { rank: game.progress.rank("blade"), told };
    });

    expect(ranked).toEqual({ rank: 1, told: "Blade: Trained!" });

    // Into the taproom to the barkeep, and what he has for sale: an ale bought for 2 gold
    await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const player = game.battle.actor("player");

        player.hp = player.maxHp;
        game.battle.command("player", { type: "enter", link: "tavern-door" });

        for (let second = 0; second < 120 && player.map !== "taproom"; second += 5) {
            game.advance(5, { render: false });
        }

        game.battle.command("player", { type: "move", to: [7, 6] });
        game.advance(5);

        // (Tapped again as he goes about the room, till the player's up to him: where he is
        // depends on how long the game ran before it was stopped)
        for (let tap = 0; tap < 12 && game.battle.actor("barkeep").talkingTo !== "player"; tap++) {
            const spot = session.view.toScreen(game.avatars.get("barkeep").point(0.6));

            game.tap(spot.x, spot.y, { time: performance.now() + 9000 * (tap + 1) });
            game.advance(4);
        }

        game.start();
    });

    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await talk.getByRole("button", { name: /for sale/ }).click();
    await expect(talk).toBeHidden();
    await expect(pack).toBeVisible();
    await expect(pack.locator(".pack-title")).toContainText("Trading with");
    await expect(pack.locator(".wares .pack-row")).toHaveText(["Tankard of ale2 goldBuy", "Hot meal5 goldBuy"]);
    await pack.getByRole("button", { name: "Buy Tankard of ale for 2 gold" }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("28 gold");
    await expect(page.locator("#playerplate .coins")).toHaveText("28 gold");
    expect(await pack.locator(".carried .pack-cell[data-item]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("aria-label")))).toEqual(["Healing draught", "Tankard of ale"]);

    // Sold back (for a gold piece), then bought again; the pack closed with its button
    await pack.locator('.carried .pack-cell[data-item="ale"]').click();
    await pack.getByRole("button", { name: /^Sell .*: Tankard of ale$/ }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("29 gold");
    await pack.getByRole("button", { name: "Buy Tankard of ale for 2 gold" }).click();
    await expect(pack.locator(".pack-gold")).toHaveText("27 gold");
    await page.locator("#packbutton").click();
    await expect(pack).toBeHidden();

    // Kept for the next time (as it was read at the start): the blade trained, the gold, the ale
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("pellagos.progress")));

    expect(kept).toMatchObject({ created: SAVE.created, seed: 1, gold: 27 });
    expect(kept.pack.slice(0, 3)).toEqual([{ id: "potion", quality: "common", count: 1 }, { id: "ale", quality: "common", count: 1 }, null]);
    expect(kept.skills.blade).toBeGreaterThanOrEqual(100);
});

test("what lingers after a creature's blow shows on the player's plate, and its cure from the guild ends it", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    // Poisoned (as an adder's bite leaves them), a cure in their pack
    await page.evaluate(() => {
        const { game } = window.pellagos;

        game.host.players.get(game.me).progress.stow({ id: "antidote" }, 1);
        game.battle.afflict(game.me, "poison", { by: null });
    });

    const icon = page.locator('#playerplate .ail[aria-label="Poisoned"]');

    await expect(icon).toBeVisible();
    await expect(page.locator("#banner")).toContainText("You're poisoned! (Cure poison draught: the adventurers' guild sells them.)");

    // (Hurting now and then: less health)
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).hp), { timeout: 20000 }).toBeLessThan(50);

    // The cure drunk from the pack: gone at once
    await page.keyboard.press("i");

    const pack = page.locator(".pack");

    await pack.locator('.carried .pack-cell[data-item="antidote"]').click();
    await expect(pack.locator(".pack-about")).toContainText("Cures what's poisoned at once.");
    await pack.locator(".pack-about").getByRole("button", { name: /^Drink/ }).click();
    await expect(icon).toHaveCount(0);
    await expect(page.locator("#banner")).toContainText("No longer poisoned.");
    expect(await page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).afflictions)).toEqual([]);

    // (With nothing to cure, a cure's kept)
    await page.evaluate(() => window.pellagos.game.host.players.get(window.pellagos.game.me).progress.stow({ id: "antidote" }, 1));
    await page.keyboard.press("i");
    await page.keyboard.press("i");
    await pack.locator('.carried .pack-cell[data-item="antidote"]').click();
    await pack.locator(".pack-about").getByRole("button", { name: /^Drink/ }).click();
    await expect(page.locator("#banner")).toContainText("There's nothing for that to cure.");
    expect(await page.evaluate(() => window.pellagos.game.progress.count("antidote"))).toBe(1);
});

test("the pack stacks things alike: dragged together, split by how many, held for a thing's wheel; thrown away and taken back; dropped on the ground, and picked up", async ({ page }) => {
    // (A long walk through: more than the usual time, with others running beside it)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const pack = page.locator(".pack");
    const cell = (index) => pack.locator(`.carried .pack-cell[data-index="${index}"]`);
    const middle = async (locator) => {
        const box = await locator.boundingBox();

        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    // Two draughts in the first slot, an ale in the second, three more draughts in the sixth
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const { pack } = game.host.players.get(game.me).progress;

        pack[0] = { id: "potion", quality: "common", count: 2 };
        pack[1] = { id: "ale", quality: "common", count: 1 };
        pack[5] = { id: "potion", quality: "common", count: 3 };
    });
    await page.keyboard.press("i");
    await expect(cell(0).locator(".pack-count")).toHaveText("2");

    // (The world stops being drawn while the pack's used: drawn without a GPU, a frame can take
    // longer than a hold, and a drag would be taken for one)
    await page.evaluate(() => window.pellagos.game.stop());
    await expect(cell(5).locator(".pack-count")).toHaveText("3");
    await expect(cell(1).locator(".pack-count")).toHaveCount(0);

    // The three dragged onto the two: five, together
    const from = await middle(cell(5));
    const onto = await middle(cell(0));

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y, { steps: 3 });
    await page.mouse.move(onto.x, onto.y, { steps: 8 });
    await page.mouse.up();
    await expect(cell(0).locator(".pack-count")).toHaveText("5");
    await expect(cell(5)).toHaveClass(/empty/);

    // Held on the five: their wheel (drink, put on a wheel, split, throw away, drop); flicked E,
    // how many to split off (two, to start with), and split off into the first empty slot
    const five = await middle(cell(0));
    const wheel = page.locator(".item-wheel");

    await page.mouse.move(five.x, five.y);
    await page.mouse.down();
    await expect(wheel).toBeVisible();

    const slice = (direction) => wheel.locator(`.slice[data-direction="${direction}"] .label`);

    await expect(slice("n")).toHaveText("Drink");
    await expect(slice("ne")).toHaveText("Put on a wheel");
    await expect(slice("e")).toHaveText("Split");
    await expect(slice("s")).toHaveText("Throw away");
    await expect(slice("w")).toHaveText("Drop");
    await page.mouse.move(five.x + 20, five.y, { steps: 2 });
    await page.mouse.move(five.x + 50, five.y, { steps: 2 });
    await page.mouse.up();

    const ask = pack.locator(".pack-ask");

    await expect(ask).toBeVisible();
    await expect(ask.locator(".pack-ask-title")).toHaveText("Split Healing draught");
    await expect(ask.locator(".pack-ask-count")).toHaveText("2");
    await ask.getByRole("button", { name: "Split off" }).click();
    await expect(cell(0).locator(".pack-count")).toHaveText("3");
    await expect(cell(2).locator(".pack-count")).toHaveText("2");

    // Put on the player's own wheel, from its buttons
    await cell(0).click();
    await pack.getByRole("button", { name: "Put on a wheel: Healing draught" }).click();
    await expect(page.locator("#banner")).toHaveText("Draught put on your own wheel one, at NE.");
    expect(await page.evaluate(() => window.pellagos.game.wheels.self[0])).toEqual({ n: "vigor", ne: "item:potion" });

    // The two thrown away, and taken back
    await cell(2).click();
    await pack.getByRole("button", { name: "Throw away: Healing draught" }).click();
    await expect(cell(2)).toHaveClass(/empty/);
    await expect(page.locator("#banner")).toContainText("Thrown away: 2 healing draughts.");
    await page.locator("#banner .banner-action").click();
    await expect(cell(2).locator(".pack-count")).toHaveText("2");

    // Right-clicked, the ale's wheel stays open to click: dropped where the player stands
    await cell(1).click({ button: "right" });
    await expect(wheel).toBeVisible();
    await wheel.locator('.slice[data-action="drop"]').click();
    await expect(cell(1)).toHaveClass(/empty/);
    expect(await page.evaluate(() => [...window.pellagos.game.host.ground.values()].map(({ item }) => item))).toEqual([{ id: "ale", quality: "common", count: 1 }]);
    await page.evaluate(() => window.pellagos.game.start());
    await page.keyboard.press("Escape");
    await expect(pack).toBeHidden();

    // A bundle where it lies, its icon over it; tapped, picked up
    await expect.poll(() => page.evaluate(() => window.pellagos.game.drops.drawn.size)).toBe(1);

    const bundle = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const [drawn] = game.drops.drawn.values();

        return session.view.toScreen(drawn.object.position.clone());
    });

    await page.mouse.click(bundle.x, bundle.y);
    await expect(page.locator("#banner")).toHaveText("You pick up a tankard of ale.");
    expect(await page.evaluate(() => ({ ground: window.pellagos.game.host.ground.size, ale: window.pellagos.game.progress.count("ale") }))).toEqual({ ground: 0, ale: 1 });
});

test("the town hall: the reeve gives work, and pays for what's done; the journal shows where the player stands, what they carry and where it takes them; given up, it's set down", async ({ page }) => {
    // (A long walk through: more than the usual time, with others running beside it)
    test.setTimeout(180000);

    await playing(page, "/?play&seed=1");

    // Into the home town's hall, up to the reeve's desk
    const hall = await page.evaluate(() => {
        const { game } = window.pellagos;
        const building = game.world.interiors.buildings.get("home:hall-1");

        game.stop();
        Object.assign(game.battle.actor("orc"), { dead: true, respawnAt: Infinity });
        game.battle.command("player", { type: "enter", link: building.door.id });

        for (let second = 0; second < 90 && game.battle.actor("player").map === "town"; second += 5) {
            game.advance(5, { render: false });
        }

        game.battle.command("player", { type: "move", to: [8, 5] });
        game.advance(6, { render: false });
        game.battle.command("player", { type: "move", to: [8, 4] });
        game.advance(3);

        return { map: game.battle.actor("player").map, roles: building.folk.map(({ role }) => role), name: building.name };
    });

    expect(hall.map).toBe("home:hall-1/chamber");
    expect(hall.roles).toEqual(expect.arrayContaining(["reeve", "clerk"]));

    // The reeve: work, taken on
    const reeve = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const spot = session.view.toScreen(game.avatars.get("home:hall-1/reeve").point(0.6));

        game.tap(spot.x, spot.y, { time: performance.now() + 9000 });
        game.advance(8);
        game.start();

        return game.world.interiors.buildings.get("home:hall-1").folk.find(({ role }) => role === "reeve").name;
    });
    const talk = page.locator(".talk");

    await expect(talk).toBeVisible();
    await expect(talk.locator(".talk-name")).toHaveText(reeve);
    await expect(talk.locator(".talk-title")).toHaveText("Reeve");
    await talk.getByRole("button", { name: /work for me/ }).click();
    await expect(talk.locator(".talk-line")).toContainText(/gold|rolls/);
    await talk.getByRole("button", { name: "I'll do it." }).click();
    await expect(page.locator("#banner")).toContainText("New request");

    const taken = await page.evaluate(() => window.pellagos.game.standing.requests.map(({ title, from }) => ({ title, from: from.name })));

    expect(taken).toHaveLength(1);
    expect(taken[0].from).toBe(reeve);

    // A letter for the reeve (as if brought from another town), handed over and paid for
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const home = game.world.start;

        game.standing.take({ kind: "message", title: "A letter to carry", key: home.id, from: { id: "x", name: "Ida Crane", title: "Reeve", town: "elsewhere", townName: "Elsewhere", post: "hall" }, target: { town: home.id, name: home.name, at: [...home.at], post: "hall" }, text: "Carry this letter.", given: 0, until: 999, state: "open", count: 0, reward: { standing: 20, gold: 9 } });
    });
    await talk.getByRole("button", { name: /Where do I stand/ }).click();
    await expect(talk.locator(".talk-line")).toContainText("Commoner");
    await talk.getByRole("button", { name: /It's done/ }).click();
    await expect(talk.locator(".talk-line")).toContainText("A letter from Elsewhere");
    await expect(page.locator("#playerplate .coins")).toHaveText("29 gold");
    await page.keyboard.press("Escape");
    await expect(talk).toBeHidden();

    // J: the journal, their rank, the work they carry and where it takes them, and the letter done
    const journal = page.getByRole("dialog", { name: "Journal" });

    await page.keyboard.press("j");
    await expect(journal).toBeVisible();
    await expect(journal.locator(".journal-rank")).toContainText("Commoner of the Kingdom of");
    await expect(journal.locator(".journal-request-title")).toHaveText([taken[0].title]);
    await expect(journal.locator(".journal-done")).toContainText(["A letter to carry"]);
    await expect(journal.locator(".journal-people")).toContainText("Ruled by");

    // Given up: set down, and the journal closed with its button
    await journal.getByRole("button", { name: `Give up ${taken[0].title}` }).click();
    await expect(journal.locator(".journal-request")).toHaveCount(0);
    await expect(journal.locator(".journal-done").first()).toContainText("Given up");
    await page.locator("#journalbutton").click();
    await expect(journal).toBeHidden();
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
    await expect(page.locator("#worldmapkey li")).toHaveCount(7);

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
    // (The game started twice: more than the usual time)
    test.setTimeout(180000);
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

test("holding on an enemy or the player opens the action wheel: flick left (W) to stun it, or up (N) to heal", async ({ page }) => {
    // (Held three times, with the world played on between: more than the usual time, with others
    // running beside it)
    test.setTimeout(180000);
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".action-wheel");
    const up = wheel.locator('.slice[data-direction="n"]');
    const left = wheel.locator('.slice[data-direction="w"]');

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
    const flickLeft = async ({ x, y }) => {
        await page.mouse.move(x - 25, y, { steps: 2 });
        await page.mouse.move(x - 60, y, { steps: 2 });
    };
    // Play on without drawing, then carry on
    const playOn = (seconds) => page.evaluate((seconds) => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(seconds);
        game.start();
    }, seconds);

    // Held on the orc: its wheel's eight slices, the four elements' first spells round the top
    // (Burn at N), Stun at W, S to turn it over, and the rest empty
    await hold(orcAt);
    await expect(up.locator(".label")).toHaveText("Burn");
    await expect(left.locator(".label")).toHaveText("Stun");
    await expect(wheel.locator(".slice")).toHaveCount(8);
    await expect(wheel.locator('.slice.flip[data-direction="s"] .label')).toHaveText("Wheel 2");
    await expect(wheel.locator(".slice.empty")).toHaveCount(2);
    await flickLeft(orcAt);
    await page.mouse.up();
    await playOn(0.6);

    const stunned = await page.evaluate(() => {
        const { battle } = window.pellagos.game;

        return { stunned: battle.actor("orc").stunnedUntil > battle.time, cooldown: battle.cooldown("player", "stun") };
    });

    expect(stunned.stunned).toBe(true);
    expect(stunned.cooldown).toBeGreaterThan(0.5);

    // Held on the player while spells cool down: Vigor greyed over, and a flick at it refused. (The
    // game plays on in real time meanwhile, so the cooldown's started again, not to run out first.)
    const meAt = await page.evaluate(() => {
        const { game, session } = window.pellagos;
        const { battle } = game;

        battle.actor("player").spellReadyAt = battle.time + 3000;

        return session.view.toScreen(game.avatars.get("player").point(0.5));
    });

    await hold(meAt);
    await expect(up.locator(".label")).toHaveText("Vigor");
    await expect(up).toHaveClass(/cooling/);
    expect(await up.locator(".cooldown").getAttribute("d")).not.toBe("");
    await flickUp(meAt);
    await expect(up).toHaveClass(/refused/);
    await page.mouse.up();
    expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").casting)).toBeNull();

    // Once it's over, the flick heals, by 8 to 12
    await playOn(3);
    await hold(meAt);
    await expect(up).not.toHaveClass(/cooling/);
    await flickUp(meAt);
    await page.mouse.up();
    await playOn(1);

    const hp = await page.evaluate(() => window.pellagos.game.battle.actor("player").hp);

    expect(hp).toBeGreaterThanOrEqual(28);
    expect(hp).toBeLessThanOrEqual(32);
});

test("the action wheels: flicked down, the other side; what's on each chosen in Game options, from what's learnt and carried; a draught drunk from wheel two", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const wheel = page.locator(".action-wheel");
    const menu = page.locator("#menu");
    const setup = page.locator("#wheelsetup");

    // Two draughts in the pack, and Healing's second spell come to; the player hurt
    await page.evaluate(() => {
        const { game } = window.pellagos;
        const progress = game.host.players.get(game.me).progress;

        progress.stow({ id: "potion" });
        progress.stow({ id: "potion" });
        progress.schools.healing = 300;
        game.battle.actor(game.me).hp = 20;
    });

    // Game options, Action wheels: the player's own, wheel one, with Vigor at N
    await page.locator("#menubutton").click();
    await page.locator("#optionsbutton").click();
    await page.locator("#wheelsbutton").click();
    await expect(menu.locator("#wheelstitle")).toBeVisible();
    await expect(setup.locator('.wheels-tab[aria-selected="true"]')).toHaveText(["Yourself", "Wheel one"]);
    await expect(setup.locator('.slice[data-direction="n"] .label')).toHaveText("Vigor");

    // What can go on it: nothing, the healing spells known, and the draughts carried; a foe's
    // has those, the elements' spells and Stun, and no draughts
    await expect(setup.locator(".wheels-choice")).toHaveText(["Nothing", "Vigor", "Mend Wounds", "Draught"]);
    await setup.getByRole("tab", { name: "A foe" }).click();
    await expect(setup.locator(".wheels-choice")).toHaveText(["Nothing", "Vigor", "Mend Wounds", "Burn", "Rumble", "Hurt", "Blister", "Stun"]);
    await setup.getByRole("tab", { name: "Yourself" }).click();

    // A draught at NE of wheel two (tapping S turns it over, as flicking it does)
    await setup.locator('.slice[data-direction="s"]').click();
    await expect(setup.locator('.wheels-tab[aria-selected="true"]')).toHaveText(["Yourself", "Wheel two"]);
    await setup.locator('.slice[data-direction="ne"]').click();
    await expect(setup.locator(".wheels-heading")).toHaveText("Yourself, wheel two, NE");
    await setup.locator('.wheels-choice[data-action="item:potion"]').click();
    await expect(setup.locator('.slice[data-direction="ne"] .label')).toHaveText("Draught");
    await expect(setup.locator('.slice[data-direction="ne"] .count')).toHaveText("2");
    expect(await page.evaluate(() => window.pellagos.game.wheels.self)).toEqual([{ n: "vigor" }, { ne: "item:potion" }]);

    // Escape goes back a page, and again; then the game
    await page.keyboard.press("Escape");
    await expect(menu.locator("#optionstitle")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.locator("#resumebutton").click();
    await expect(menu).toBeHidden();

    // Held on the player: wheel one; flicked down, wheel two, opened again under the finger
    const me = await page.evaluate(() => {
        const { game, session } = window.pellagos;

        return session.view.toScreen(game.avatars.get(game.me).point(0.5));
    });

    await page.mouse.move(me.x, me.y);
    await page.mouse.down();
    await expect(wheel).toBeVisible();
    await expect(wheel).toHaveAttribute("data-side", "1");
    await page.mouse.move(me.x, me.y + 25, { steps: 2 });
    await page.mouse.move(me.x, me.y + 55, { steps: 2 });
    await expect(wheel).toHaveAttribute("data-side", "2");
    await expect(wheel.locator('.slice[data-direction="ne"] .label')).toHaveText("Draught");
    await expect(wheel.locator('.slice[data-direction="ne"] .count')).toHaveText("2");
    await expect(wheel.locator('.slice.flip[data-direction="s"] .label')).toHaveText("Wheel 1");

    // Flicked NE from there: a draught drunk
    await page.mouse.move(me.x + 20, me.y + 35, { steps: 2 });
    await page.mouse.move(me.x + 40, me.y + 15, { steps: 2 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.pellagos.game.battle.actor(window.pellagos.game.me).hp)).toBe(45);
    expect(await page.evaluate(() => window.pellagos.game.progress.count("potion"))).toBe(1);
});

test("magic: the spellbook shows every school and the tomes; a tome read teaches its spell, put on a wheel from the book; the seventh tier floods the screen; summoned by another player, asked whether to go", async ({ page }) => {
    await playing(page, "/?play&seed=1");

    const book = page.locator(".spellbook");

    // Play on without drawing, then carry on
    const playOn = (seconds) => page.evaluate((seconds) => {
        const { game } = window.pellagos;

        game.stop();
        game.advance(seconds);
        game.start();
    }, seconds);

    // The spellbook, from its button: the five schools, the hexes and the tomes; each school's
    // first spell known and Stun, the rest still to come
    await page.locator("#spellbookbutton").click();
    await expect(book).toBeVisible();
    await expect(book.locator(".journal-heading")).toHaveText(["Healing", "Fire", "Earth", "Air", "Water", "Hexes", "From tomes"]);
    await expect(book.locator(".spellbook-spell:not(.unknown) .spellbook-name")).toHaveText(["Vigor", "Burn", "Rumble", "Hurt", "Blister", "Stun"]);
    await expect(book.locator(".spellbook-spell.unknown")).toHaveCount(4 + 6 * 4 + 1);

    // A tome of Levitate in the pack, read: the spell learnt (the book shows it), and put on the
    // player's own wheel from it
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;

        game.progress.stow({ id: "tomeLevitate", quality: "common" });

        return game.host.command(game.me, { type: "use", item: "tomeLevitate" });
    })).toEqual({ ok: true });
    await playOn(0.2);
    await expect(book.locator(".spellbook-spell:not(.unknown) .spellbook-name")).toContainText(["Levitate"]);
    await book.locator('button[aria-label="Put Levitate on an action wheel"]').click();
    expect(await page.evaluate(() => Object.values(window.pellagos.game.wheels.self[0]))).toContain("levitate");
    await page.keyboard.press("Escape");
    await expect(book).toBeHidden();

    // Fire grown to its seventh tier: Hellfire cast on an orc floods the screen with red, shakes
    // the camera and fills the ground round it with fire
    const cast = await page.evaluate(() => {
        const { game } = window.pellagos;
        const me = game.battle.actor(game.me);

        game.progress.schools.fire = 30000;
        game.battle.add({ id: "target", kind: "orc", weapon: "cleaver", team: "orcs", square: [me.square[0] + 1, me.square[1] - 3], hp: 5000 });
        game.enlisting.push("target");
        game.stop();
        game.advance(0.5);
        Object.assign(me, { spellReadyAt: 0, spellsReadyAt: {} });

        const result = game.host.command(game.me, { type: "cast", spell: "hellfire", target: "target" });

        game.advance(1.5);

        const wash = document.querySelector(".spellwash");
        const seen = { result, washed: wash.getAnimations().length > 0 && wash.style.background.includes("rgba(255, 42, 10"), shaking: game.shaking, showing: game.spellFx.running.length };

        game.start();

        return seen;
    });

    expect(cast.result).toEqual({ ok: true });
    expect(cast.washed).toBe(true);
    expect(cast.shaking).toBeGreaterThan(0);
    expect(cast.showing).toBeGreaterThan(8);

    // Another player summons them: asked whether to go, and going, they're at their side
    expect(await page.evaluate(() => {
        const { game } = window.pellagos;
        const { host, battle } = game;
        const me = battle.actor(game.me);

        battle.remove("target");
        host.join({ id: "guest", hero: { ...host.players.get(game.me).hero, name: "Bram" }, progress: { spells: ["summon"] } });
        battle.place("guest", "town", [me.square[0] + 24, me.square[1]]);
        Object.assign(battle.actor("guest"), { spellReadyAt: 0, spellsReadyAt: {} });

        return host.command("guest", { type: "cast", spell: "summon", target: game.me });
    })).toEqual({ ok: true });
    await playOn(2);

    const choice = page.locator(".choice");

    await expect(choice.locator(".choice-title")).toHaveText("Bram is summoning you to their side. Go?");
    await choice.locator(".choice-option", { hasText: "Go to Bram" }).click();
    await expect(choice).toHaveCount(0);
    await playOn(0.5);
    expect(await page.evaluate(() => {
        const { battle } = window.pellagos.game;
        const [me, guest] = [battle.actor("player"), battle.actor("guest")];

        return Math.hypot(me.x - guest.x, me.y - guest.y);
    })).toBeLessThan(5);
});

test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test("fits the screen: the title, making a character and the game's buttons; runs where the ground is double-tapped", async ({ page }) => {
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

        // The ground double-tapped: the player runs there
        await doubleTap(page, await spotNorth(page, 4), { touch: true });

        expect(await page.evaluate(() => window.pellagos.game.battle.actor("player").order?.run)).toBe(true);
    });
});
