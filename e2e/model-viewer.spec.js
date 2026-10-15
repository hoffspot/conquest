import { expect, test } from "./fixtures.js";

// The model viewer (model-viewer.html; the creature lab, creature-lab.html, sends on to it): a
// creature chosen, shown as the game draws it, each of its moves played by name, paused, slowed
// and stepped a frame back and on; drawn from a model, every clip in its file played alone; its
// skeleton and wireframe shown; and what there is of it and whose it is. It exposes itself as
// window.lab, which these tests use alongside its panel.

test.beforeEach(async ({ page }) => {
    page.on("pageerror", (error) => {
        throw error;
    });
});

async function openViewer(page, address) {
    await page.goto(address);
    await page.waitForFunction(() => window.lab, null, { timeout: 60000 });
    await expect(page.locator("#status")).toBeHidden();
}

// Where a bone of a people-shaped creature is (metres), as it's drawn now
const boneAt = (page, name) =>
    page.evaluate((bone) => {
        const node = window.lab.avatar().character.object.getObjectByName(bone);

        node.updateWorldMatrix(true, false);

        return node.matrixWorld.elements.slice(12, 15);
    }, name);

test("the creature lab's address opens the model viewer on what it asked for; a creature's moves played by name, paused, slowed, and stepped a frame back and on to just where it was", async ({ page }) => {
    await openViewer(page, "/creature-lab.html?creature=goblin");
    expect(new URL(page.url()).pathname).toBe("/model-viewer.html");
    await expect(page.locator("#name")).toHaveText("Goblin raider");

    // (Its cleaver's attacks and its ways of resting, each by name)
    const moves = page.locator("#moves");

    await expect(moves.getByRole("button", { name: "flat chop" })).toBeVisible();
    await expect(moves.getByRole("button", { name: "arms folded" })).toBeVisible();
    await expect(page.locator("#clips")).toContainText("Built in code");

    // Paused, one chosen, stepped on 12 frames, back 5, and on 5 again: just where it was
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("#play")).toHaveText("Play");
    await moves.getByRole("button", { name: "flat chop" }).click();
    await expect(moves.getByRole("button", { name: "flat chop" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#about")).toContainText("flat chop");
    await expect(page.locator("#time")).toHaveText("0.00 s into it");

    // (Each button once, and the rest of the steps as they'd take it: window.lab.step)
    const steps = (frames) => page.evaluate((count) => {
        for (let k = 0; k < Math.abs(count); k++) {
            window.lab.step(Math.sign(count));
        }
    }, frames);

    await page.getByRole("button", { name: "On a frame" }).click();
    await steps(11);
    await expect(page.locator("#time")).toHaveText("0.40 s into it");

    const there = await boneAt(page, "RightHand");

    await page.getByRole("button", { name: "Back a frame" }).click();
    await steps(-4);
    await expect(page.locator("#time")).toHaveText("0.23 s into it");
    expect(await page.evaluate(() => window.lab.watch().past)).toBe(true);
    expect(Math.hypot(...(await boneAt(page, "RightHand")).map((value, k) => value - there[k]))).toBeGreaterThan(0.01);

    await steps(5);
    await expect(page.locator("#time")).toHaveText("0.40 s into it");
    expect(Math.hypot(...(await boneAt(page, "RightHand")).map((value, k) => value - there[k]))).toBeLessThan(1e-4);

    // (As far back as it keeps, and no further)
    await steps(-14);
    await expect(page.locator("#time")).toContainText("as far back as is kept");

    // Slowed, and played once rather than over and over
    await page.locator("#speed").selectOption("0.25");
    await page.getByLabel("Loop").uncheck();
    await page.getByRole("button", { name: "Play" }).click();

    const watch = await page.evaluate(() => window.lab.watch());

    expect(watch.speed).toBe(0.25);
    expect(watch.loop).toBe(false);
    expect(watch.playing).toBe(true);

    // (Its details: a character, as the game builds one, its bones counted)
    const details = page.locator("#details");

    await expect(details).toContainText("a character");
    await expect(details).toContainText("CharMorph");
    expect(await page.evaluate(() => window.lab.details().bones)).toBeGreaterThan(40);
});

test("a creature drawn from a model: every clip in its file played alone, stepped and slid through; its skeleton and wireframe shown and hidden; what there is of it and whose it is", async ({ page }) => {
    await openViewer(page, "/model-viewer.html?creature=dreadthorn");

    // (Its stand-in shown till its model's read, then the model, its clips listed)
    const clips = page.locator("#clips");

    await expect(clips.getByRole("button", { name: /^Roar · / })).toBeVisible({ timeout: 60000 });

    const listed = await page.evaluate(() => window.lab.watch().clips);

    expect(listed).toEqual(expect.arrayContaining(["Idling", "Crawling", "Flying", "Hovering", "Bite", "Claw", "Tail Sweep", "Fire Breath", "Hover Breath", "Roar", "Death"]));

    // A clip played alone, as it was made (paused first): stepped on and back, and slid to
    await page.getByRole("button", { name: "Pause" }).click();
    await clips.getByRole("button", { name: /^Roar · / }).click();
    await expect(clips.getByRole("button", { name: /^Roar · / })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#time")).toHaveText("0.00 s of 8.00 s");

    await page.getByRole("button", { name: "On a frame" }).click();
    await page.evaluate(() => {
        window.lab.step(1);
        window.lab.step(1);
    });

    await expect(page.locator("#time")).toHaveText("0.10 s of 8.00 s");
    await page.getByRole("button", { name: "Back a frame" }).click();
    await expect(page.locator("#time")).toHaveText("0.07 s of 8.00 s");
    await page.locator("#scrub").evaluate((slider) => {
        // (As it's slid to)
        slider.value = "4";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator("#time")).toHaveText("4.00 s of 8.00 s");

    // (The game's moves for it too, by name)
    await expect(page.locator("#moves").getByRole("button", { name: "tail sweep" })).toBeVisible();

    // Its bones shown, and its wireframe, and hidden again
    await page.getByLabel("Skeleton").check();
    expect(await page.evaluate(() => window.lab.watch().bones)).toBeGreaterThan(50);
    await page.getByLabel("Wireframe").check();

    const wired = () =>
        page.evaluate(() => {
            let all = true;

            window.lab.avatar().object.traverse((node) => {
                if (node.isSkinnedMesh && node.material.colorWrite !== false) {
                    all &&= node.material.wireframe;
                }
            });

            return all;
        });

    expect(await wired()).toBe(true);
    await page.getByLabel("Skeleton").uncheck();
    await page.getByLabel("Wireframe").uncheck();
    expect(await page.evaluate(() => window.lab.watch().bones)).toBe(0);
    expect(await wired()).toBe(false);

    // What there is of it, and whose it is: its catalog's word, and a link to its licence
    const details = page.locator("#details");

    await expect(details).toContainText("From a model's file");
    await expect(details).toContainText("HuyKhoi2407");
    await expect(details).toContainText("34,266");
    await expect(details).toContainText("1024×1024 (compressed)");
    await expect(details.getByRole("link")).toHaveAttribute("href", "models/beasts/LICENSE.md");

    // (One of its clips asked for by its address: played once the model's read)
    await openViewer(page, "/model-viewer.html?creature=dreadthorn&clip=Bite");
    await page.waitForFunction(() => window.lab.watch().clip === "Bite", null, { timeout: 60000 });
});

test("one of the people, by role, people, woman or man and weapon: every motion of theirs by name (their weapon's, their work, their rests, emotes, spells, blows and falls), one played and stepped", async ({ page }) => {
    await openViewer(page, "/model-viewer.html?person=smith&people=lizard&sex=m");
    await expect(page.locator("#name")).toHaveText("Blacksmith");
    await expect(page.locator("#about")).toContainText("Lizard folk · man");

    // (Who they are, chosen in the panel; one of the folk has no weapon, and doesn't attack)
    await expect(page.locator("#person")).toBeVisible();
    await expect(page.locator("#weapon")).toBeHidden();
    await expect(page.locator("[data-action=attack]")).toBeHidden();

    const moves = page.locator("#moves");

    for (const name of ["forge", "wiping the brow", "waving hello", "a heal: lifted up", "dodging left", "dead"]) {
        await expect(moves.getByRole("button", { name, exact: true })).toBeVisible();
    }

    // (Only their own work: not the barkeep's)
    await expect(moves.getByRole("button", { name: "pour", exact: true })).toHaveCount(0);

    // One played, paused, and stepped on
    await page.getByRole("button", { name: "Pause" }).click();
    await moves.getByRole("button", { name: "forge", exact: true }).click();
    await expect(page.locator("#about")).toContainText("forge");
    await page.evaluate(() => {
        for (let k = 0; k < 10; k++) {
            window.lab.step(1);
        }
    });
    await expect(page.locator("#time")).toHaveText("0.33 s into it");

    // A soldier of the orcs: their cleaver's blows
    await page.locator("#picker").selectOption("person:soldier");
    await page.locator("#people").selectOption("orc");
    await expect(page.locator("#name")).toHaveText("Soldier");
    await expect(page.locator("#weapon")).toHaveValue("cleaver");
    await expect(moves.getByRole("button", { name: "overhead hack", exact: true })).toBeVisible();
    await expect(page.locator("[data-action=attack]")).toBeVisible();

    // An adventurer, a woman, with a bow
    await page.locator("#picker").selectOption("person:adventurer");
    await page.locator("#sex").selectOption("f");
    await page.locator("#weapon").selectOption("bow");
    await expect(page.locator("#about")).toContainText("Orc · woman · bow");
    await expect(moves.getByRole("button", { name: "side-on draw", exact: true })).toBeVisible();
    await expect(moves.getByRole("button", { name: "drawing it", exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.lab.current().person)).toMatchObject({ role: "adventurer", people: "orc", sex: "f", weapon: "bow" });

    // (Its details: a character, its licence the game's)
    await expect(page.locator("#details")).toContainText("a character");
});

test("the things: what's carried and worn, built in code; the catalog's props, the treasure chest opening as it was made; and the ox's wagon, laden as chosen", async ({ page }) => {
    await openViewer(page, "/model-viewer.html?item=sword");
    await expect(page.locator("#name")).toHaveText("Arming sword");

    // (A thing does nothing of a creature's: no moves, and no clips if it has none)
    await expect(page.locator("#bottom")).toBeHidden();
    await expect(page.locator("#moves button")).toHaveCount(0);
    await expect(page.locator("#clips")).toContainText("It has no clips");

    const details = page.locator("#details");

    await expect(details).toContainText("characters/items.js");
    await expect(details).toContainText("91 cm tall");

    // The treasure chest: read from the catalog, its opening played and slid through
    await page.locator("#picker").selectOption("prop:chest");

    const clips = page.locator("#clips");

    await expect(clips.getByRole("button", { name: /^Open · / })).toBeVisible({ timeout: 60000 });
    await page.getByRole("button", { name: "Pause" }).click();
    await clips.getByRole("button", { name: /^Open · / }).click();
    await page.getByRole("button", { name: "On a frame" }).click();
    await expect(page.locator("#time")).toHaveText(/^0\.03 s of 0\.\d\d s$/);
    await expect(details).toContainText("JMI 3D Toolkit's, MIT");
    await expect(details.getByRole("link")).toHaveText("MIT (the game's credits)");

    // A prop: its source and licence as the catalog has them
    await page.locator("#picker").selectOption("prop:dungeon-prop-barrel");
    await expect(details).toContainText("Poly Haven wine_barrel_01, CC0", { timeout: 60000 });
    await expect(details).toContainText("From a model's file");

    // The ox's wagon, its people's and laden with stone: chosen in the panel
    await page.locator("#picker").selectOption("ox");
    await expect(page.locator("#personing")).toHaveText("Wagon");
    await expect(page.locator("#sex")).toBeHidden();
    await page.locator("#load").selectOption("stone");
    await page.locator("#people").selectOption("orc");
    await expect(page.locator("#bottom")).toBeVisible();
    expect(await page.evaluate(() => window.lab.current().id)).toBe("ox");
});
