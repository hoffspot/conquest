import { expect, test } from "./fixtures.js";
import { LEFT_OUT, licensedModelsHere } from "../scripts/licensed-models.js";

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
    test.skip(!licensedModelsHere(), LEFT_OUT);
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

test("a creature's model as it was made (?model=): the werewolf, every clip in its file, its full detail only, each of its skins put on, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-werewolf&skin=dusk&clip=Walk");

    // (Not listed with the creatures to come: it's in the game. Read, its clips listed, the one
    // asked for by its address played, in the skin asked for)
    expect(await page.locator("#picker optgroup[label^='Coming to the wilds'] option").allTextContents()).not.toContain("Werewolf");
    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    // (Its own six, and three made up from them: utilities/blenderpipeline's clips.invent)
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual(["Attack", "Death", "Hit React", "Idle", "Idle Alert", "Walk", "Howl", "Claw", "Run"]);
    await page.waitForFunction(() => window.lab.watch().clip === "Walk" && window.lab.current().thing.skin === "dusk", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The werewolf");
    await expect(page.locator("#bottom")).toBeHidden();

    // Its full detail drawn, the lower ones packed in its file left hidden: its body and two
    // lengths of fur
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 3, triangles: 16456, bones: 67 });

    // Each skin's textures in place of its own, the rest its own: the dusk's colour on its fur, its
    // own normals; the moonfang's glow; and its own skin again
    const looks = () =>
        page.evaluate(() => {
            const fur = window.lab.avatar().object.getObjectByName("Mane");
            const body = window.lab.avatar().object.getObjectByName("Body");
            const own = (node) => node.userData.ownMaterial ?? node.material;

            return { fur: fur.material.map === own(fur).map, normals: fur.material.normalMap === own(fur).normalMap, glow: body.material.emissiveMap === own(body).emissiveMap, skin: window.lab.current().thing.skin };
        });

    expect(await looks()).toEqual({ fur: false, normals: true, glow: true, skin: "dusk" });
    await expect(page.getByLabel("Skin")).toHaveValue("dusk");
    expect(await page.getByLabel("Skin").locator("option").allTextContents()).toEqual(["Its own skin", "Dusk", "Ash", "Russet", "Moonfang", "Rotten"]);
    await page.getByLabel("Skin").selectOption("moonfang");
    await page.waitForFunction(() => window.lab.current().thing.skin === "moonfang", null, { timeout: 60000 });
    expect(await looks()).toEqual({ fur: false, normals: true, glow: false, skin: "moonfang" });
    await page.getByLabel("Skin").selectOption("");
    await page.waitForFunction(() => window.lab.current().thing.skin === "");
    expect(await looks()).toEqual({ fur: true, normals: true, glow: true, skin: "" });

    // What there is of it, and whose it is: bought on Fab, its licence's note linked to
    const details = page.locator("#details");

    await expect(details).toContainText("From a model's file");
    await expect(details).toContainText("bought on Fab: used with the permission its Standard License gives");
    await expect(details).toContainText("5 more");
    await expect(details).toContainText("1024×1024 (compressed)");
    await expect(details.getByRole("link")).toHaveAttribute("href", "models/beasts/LICENSE.md");

    // (Not one of the game's creatures: none of the skin chooser for one)
    await page.locator("#picker").selectOption("wolf");
    await expect(page.getByLabel("Skin")).toBeHidden();
});

test("the centipede's model as it was made (the ants' nests' great centipede's): all 23 clips in its file, its full detail only, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-centipede&clip=Run");

    // (In the game now, as are the ant, the spiders, the scorpion, the cockroach, the wasp, the
    // black widow, the Ant Monster, the greater demon (a hell's lord), the fiend (its packs), and its
    // six flayed and six gorgers: every bought model is, none listed as to come; read, its clips
    // listed, the one asked for by its address played)
    expect(await page.locator("#picker optgroup[label^='Coming to the wilds'] option").allTextContents()).toEqual([]);
    expect(await page.locator("#picker optgroup[label=\"The ants' nests\"] option").allTextContents()).toEqual(["Giant ant", "Great centipede", "Dungeon spider", "Elite dungeon spider", "Giant cockroach", "Dungeon wasp", "Dungeon scorpion", "Black widow", "Ant Monster"]);
    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Death",
        "Death 2",
        "Death 3",
        "Eat",
        "Eat 2",
        "Eat 3",
        "Get Down",
        "Get Up",
        "Hit React",
        "Hit React 2",
        "Idle",
        "Idle 2",
        "Jump Back",
        "Painful",
        "Run",
        "Sleep",
        "Wake Up",
        "Walk",
        "Walk 2",
        "Walk Eat",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Run", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The centipede");

    // Its full detail drawn, the lower ones packed in its file left hidden; no skins to choose
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 33539, bones: 81 });
    await expect(page.getByLabel("Skin")).toBeHidden();

    // What there is of it, and whose it is: bought on Fab, its licence's note linked to
    const details = page.locator("#details");

    await expect(details).toContainText("From a model's file");
    await expect(details).toContainText("Centipede Monster-V2, bought on Fab: used with the permission its Standard License gives");
    await expect(details).toContainText("1024×1024 (compressed)");
    await expect(details.getByRole("link")).toHaveAttribute("href", "models/beasts/LICENSE.md");
});

test("and the Ant Monster's: all 31 clips in its file, turned to face the game's front, its see-through parts cut out", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-ant-monster&clip=Walk");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Attack 5",
        "Call Flock",
        "Crawl Up",
        "Death",
        "Eat",
        "Funny",
        "Hit React",
        "Hit React 2",
        "Idle",
        "Idle 2",
        "Idle 3",
        "Jump",
        "Landing",
        "Landing 2",
        "Landing 3",
        "Left Right",
        "Lying",
        "Lying Back",
        "Lying Back 2",
        "Play",
        "Play 2",
        "Play 3",
        "Run",
        "Sleep",
        "Up",
        "Up 2",
        "Walk",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Walk", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Ant Monster");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 35172, bones: 57 });

    // Its head ahead of its tail along +z, where the game's creatures face (in its own space,
    // however it's shown); its spines and wings cut out of its colour's alpha, not blended (drawn
    // with the solid, its depth written)
    const shape = await page.evaluate(() => {
        const object = window.lab.avatar().object;
        const mesh = object.getObjectByProperty("isSkinnedMesh", true);
        const at = (name) => {
            const bone = object.getObjectByName(name);

            return object.worldToLocal(bone.getWorldPosition(bone.position.clone()));
        };

        object.updateMatrixWorld(true);

        const [head, tail] = [at("Bip001_Head"), at("Bn_tail_05")];

        return { ahead: head.z - tail.z > 2 * Math.abs(head.x - tail.x), transparent: mesh.material.transparent, cut: mesh.material.alphaTest };
    });

    expect(shape).toEqual({ ahead: true, transparent: false, cut: 0.5 });
    await expect(page.locator("#details")).toContainText("Ant Monster V1b, bought on Fab: used with the permission its Standard License gives");
});

test("and the ant: all 12 clips in its file, its full detail only, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-ant&clip=Run");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual(["Attack", "Cool", "Drink", "Eat", "Idle", "Idle 2", "Jump", "Play", "Play 2", "Play 3", "Run", "Walk"]);
    await page.waitForFunction(() => window.lab.watch().clip === "Run", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The ant");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 9768, bones: 36 });
    await expect(page.locator("#details")).toContainText("Ant V2, bought on Fab: used with the permission its Standard License gives");
});

test("and the Dungeon Spider: all 18 clips in its file, its full detail only, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-dungeon-spider&clip=Walk");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Attack 5",
        "Attack 6",
        "Death",
        "Eat",
        "Hit React",
        "Hit React 2",
        "Idle",
        "Knockdown",
        "Roar",
        "Run",
        "Slow",
        "Turn Left",
        "Turn Right",
        "Walk",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Walk", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Dungeon Spider");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 42996, bones: 54 });
    await expect(page.locator("#details")).toContainText("Spider V3, bought on Fab: used with the permission its Standard License gives");
});

test("and the Elite Dungeon Spider: all 33 clips in its file, turned to face the game's front, its glowing markings kept, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-elite-dungeon-spider&clip=Walk");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Attack 5",
        "Back",
        "Back 2",
        "Butt Attack",
        "Explode",
        "Fall Asleep",
        "Falling",
        "Falling 2",
        "Falling 3",
        "Get Up",
        "Hanging",
        "Hit React",
        "Hit React 2",
        "Idle",
        "Idle 2",
        "Jump",
        "Landing",
        "Landing 2",
        "Pose",
        "Running Attack",
        "Running Attack 2",
        "Scared",
        "Shock",
        "Sleep",
        "Stand",
        "Tumbling",
        "Wake Up",
        "Walk",
        "Walking Attack",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Walk", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Elite Dungeon Spider");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 7378, bones: 41 });

    // Its head ahead of its body along +z, where the game's creatures face (in its own space,
    // however it's shown); and its markings glowing (its emissive map, kept)
    const looks = await page.evaluate(() => {
        const object = window.lab.avatar().object;
        const mesh = object.getObjectByProperty("isSkinnedMesh", true);
        const at = (name) => {
            const bone = object.getObjectByName(name);

            return object.worldToLocal(bone.getWorldPosition(bone.position.clone()));
        };

        object.updateMatrixWorld(true);

        const [head, pelvis] = [at("Bip001_Head"), at("Bip001_Pelvis")];

        return { ahead: head.z - pelvis.z > 2 * Math.abs(head.x - pelvis.x), glows: Boolean((mesh.userData.ownMaterial ?? mesh.material).emissiveMap) };
    });

    expect(looks).toEqual({ ahead: true, glows: true });
    await expect(page.locator("#details")).toContainText("Spider V6a, bought on Fab: used with the permission its Standard License gives");
});

test("and the Dungeon Scorpion: all 16 clips in its file, its full detail only, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-dungeon-scorpion&clip=Walk");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Death",
        "Death 2",
        "Hit React Left",
        "Hit React Right",
        "Idle",
        "Knockdown",
        "Roar",
        "Run",
        "Stun",
        "Stun Left",
        "Stun Right",
        "Walk",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Walk", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Dungeon Scorpion");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 53268, bones: 66 });
    await expect(page.locator("#details")).toContainText("Scorpion V5d, bought on Fab: used with the permission its Standard License gives");
});

test("and the Giant Cockroach: its 13 clips and the 3 made up for it, made as long as a person, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-giant-cockroach&clip=Rear%20Strike");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Dead",
        "Death",
        "Eating",
        "Idle",
        "Idle 2",
        "Idle 3",
        "Idle 4",
        "Run",
        "Squished",
        "Turn Left",
        "Turn Right",
        "Walk",
        // (Made up from its idle: its own attack only paws with its forelegs, and it had no flinch)
        "Bite",
        "Rear Strike",
        "Hit React",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Rear Strike", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Giant Cockroach");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 1786, bones: 33 });
    await expect(page.locator("#details")).toContainText("Medhue's Cockroach, bought on Fab: used with the permission its Standard License gives");
});

test("and the Dungeon Wasp: its 9 clips and the flinch made up for it, standing as its clips have it, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-dungeon-wasp&clip=Fly");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Death",
        "Death 2",
        "Fly",
        "Idle",
        "Idle 2",
        // (Made up from its idle: it had no flinch)
        "Hit React",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Fly", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Dungeon Wasp");
    // (Made hovering over the ground its deaths fall to: shown there, not stood on its rest's
    // lowest point with its deaths under the ground)
    expect(await page.evaluate(() => window.lab.avatar().object.children[0].position.y)).toBe(0);
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 15960, bones: 50 });
    await expect(page.locator("#details")).toContainText("Vespa Titanus Giant Wasp, bought on Fab: used with the permission its Standard License gives");
});

test("and the Black Widow: its 28 clips that play in place and the flinch made up for it, its hairy mesh, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-black-widow&clip=Web%20Ground");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Dead",
        "Death",
        "Idle",
        "Idle 2",
        "Idle 3",
        "Idle 4",
        "Idle 5",
        "Idle 6",
        "Jump",
        "Jump Loop",
        "Land",
        "Run",
        "Turn Left",
        "Turn Right",
        "Walk",
        "Web Down",
        "Web Down Idle",
        "Web Down Idle 2",
        "Web Ground",
        "Web Idle",
        "Web Idle 2",
        "Web Idle 3",
        "Web Idle 4",
        "Web Idle 5",
        "Web Up",
        // (Made up from its idle: it had no flinch)
        "Hit React",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Web Ground", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Black Widow");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 10468, bones: 56 });
    await expect(page.locator("#details")).toContainText("Medhue's Black Widow, bought on Fab: used with the permission its Standard License gives");
});

test("and the Greater Demon: its own showcase and the roar cut from it, the human clips played on its skeleton, its one mesh, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-greater-demon&clip=Pound");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        // (Its own: the one clip it came with)
        "Showcase",
        // (Mesh2Motion's CC0 human clips, played on its skeleton, its wings beating to them)
        "Idle",
        "Walk",
        "Run",
        "Claw",
        "Punch",
        "Pound",
        "Hit",
        "Death",
        // (Cut from its showcase: crouched, wings spread, its jaw opened)
        "Roar",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Pound", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Greater Demon");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 83498, bones: 123 });
    await expect(page.locator("#details")).toContainText("Gloomy Demon, bought on Fab: used with the permission its Standard License gives");
});

test("the werewolf as the game draws it, from its model once that's read: the game's moves for it, and the skin each one wears", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?creature=werewolf");

    // (Its stand-in, a great dark wolf, till its model's read; then the model)
    await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().moves)).toEqual(expect.arrayContaining(["claw", "pounce", "howl", "look"]));
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual(["Attack", "Death", "Hit React", "Idle", "Idle Alert", "Walk", "Howl", "Claw", "Run"]);

    const details = page.locator("#details");

    await expect(details).toContainText("Skin");
    await expect(details).toContainText("one of 4 its kind wears");

    // (Another one, another skin: each of the four, by its seed)
    const skins = new Set([await page.evaluate(() => window.lab.current().skin)]);

    for (let i = 0; i < 12 && skins.size < 4; i++) {
        await page.getByRole("button", { name: "Another one" }).click();
        await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });
        skins.add(await page.evaluate(() => window.lab.current().skin));
    }

    expect([...skins].sort()).toEqual(["", "ash", "dusk", "russet"]);
});

test("and the Fiend: all 25 of its own clips, its one simplified mesh, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?model=beast-fiend&clip=Attack%203");

    await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.lab.watch().clips)).toEqual([
        "Attack",
        "Attack 2",
        "Attack 3",
        "Attack 4",
        "Attack 5",
        "Crouch Walk",
        "Death",
        "Death 2",
        "Death 3",
        "Fly Back",
        "Fly Down",
        "Fly Left",
        "Fly Right",
        "Fly Up",
        "Hit",
        "Hit 2",
        "Idle",
        "Idle 2",
        "Jump",
        "Run",
        "Turn 180",
        "Walk",
        "Walk Back",
        "Walk Left",
        "Walk Right",
    ]);
    await page.waitForFunction(() => window.lab.watch().clip === "Attack 3", null, { timeout: 60000 });
    await expect(page.locator("#name")).toHaveText("The Fiend");
    expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles: 20952, bones: 86 });
    await expect(page.locator("#details")).toContainText("Monster4, bought on Fab: used with the permission its Standard License gives");
});

test("a hell's lord as the game draws it: a people-shaped brute till the Greater Demon's read, then the demon, its claws, its punch, hellfire hurled from its fist, and its roar", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?creature=demonLord");

    // (Its stand-in a character, as the wild's people-shaped ones are, till its model's read; then
    // the model, as a beast drawn from one is)
    await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });
    expect(await page.evaluate(() => window.lab.current())).toMatchObject({ humanoid: false, attacks: ["claw", "punch"], specials: ["wand"], rests: ["roar"] });
    expect(await page.evaluate(() => window.lab.watch().moves)).toEqual(expect.arrayContaining(["claw", "punch", "wand", "roar"]));

    // (Drawn 3.2 metres tall, as long as MODELS has it)
    expect(await page.evaluate(() => window.lab.avatar().character.height)).toBeCloseTo(3.19, 1);
});

test("a hell's fiend as the game draws it: a horned stand-in till its model's read, then the fiend, its claws raked four ways, its spring, its rest, in one of its three skins", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    await openViewer(page, "/model-viewer.html?creature=fiend");
    await expect(page.locator("#picker optgroup[label='The hells'] option")).toHaveText(["Fiend", "Flayling", "Cinder husk", "Pyre acolyte", "Ossuary priest", "Dirge warden", "Flayed hierarch", "Slag gorger", "Forge brute", "Chained glutton", "Bloat gorger", "Pit ravager", "Gorger warlord"]);

    // (Its stand-in a character, as the wild's people-shaped ones are, till its model's read; then
    // the model)
    await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });
    expect(await page.evaluate(() => window.lab.current())).toMatchObject({ humanoid: false, attacks: ["claw", "rake", "slash", "smash"], specials: ["pounce"], rests: ["look"] });
    expect(await page.evaluate(() => window.lab.watch().moves)).toEqual(expect.arrayContaining(["claw", "rake", "slash", "smash", "pounce", "look"]));

    // (Drawn 2.4 metres tall, as MODELS has it)
    expect(await page.evaluate(() => window.lab.avatar().character.height)).toBeCloseTo(2.41, 1);
    await expect(page.locator("#details")).toContainText("one of 3 its kind wears");

    // (Another one, another skin: each of the three, by its seed)
    const skins = new Set([await page.evaluate(() => window.lab.current().skin)]);

    for (let i = 0; i < 12 && skins.size < 3; i++) {
        await page.getByRole("button", { name: "Another one" }).click();
        await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });
        skins.add(await page.evaluate(() => window.lab.current().skin));
    }

    expect([...skins].sort()).toEqual(["", "ash", "pale"]);
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

    // One of a band of invaders, by what they fight with; their band their people
    await page.locator("#picker").selectOption("person:raider-northmen");
    await page.locator("#weapon").selectOption("throwingAxes");
    await expect(page.locator("#name")).toHaveText("Northern axe-thrower");
    await expect(page.locator("#about")).toContainText("Northmen · woman · throwing axes");
    await expect(page.locator("#people")).toBeHidden();
    await page.locator("#picker").selectOption("person:chief-cult");
    await expect(page.locator("#name")).toHaveText("Ashen high priest");
    await expect(page.locator("#weapon")).toHaveValue("ashenPriest");

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

test("on a phone: the bars a row each and nothing off the screen, the panel under what's shown in tabs, played with its icons, what's shown in the middle of what's left; on its side, the panel beside it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openViewer(page, "/model-viewer.html?person=smith&people=lizard&sex=m");

    // (Compact, the panel shut to start with; the top bar a row and a line, playing it a row, what
    // it does a row scrolled across; nothing wider than the screen)
    const sizes = await page.evaluate(() => {
        const height = (selector) => document.querySelector(selector).getBoundingClientRect().height;

        return { top: height("#top"), transport: height("#transport"), bottom: height("#bottom"), wide: document.documentElement.scrollWidth, screen: innerWidth, ...window.lab.layout() };
    });

    expect(sizes.compact).toBe(true);
    expect(sizes.side).toBe(false);
    expect(sizes.top).toBeLessThan(90);
    expect(sizes.transport).toBeLessThan(64);
    expect(sizes.bottom).toBeLessThan(60);
    expect(sizes.wide).toBeLessThanOrEqual(sizes.screen);
    await expect(page.locator("#panel")).toBeHidden();

    // Played and paused, stepped, with its icons (their names as before)
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("#play")).toHaveAttribute("aria-label", "Play");
    await page.getByRole("button", { name: "On a frame" }).click();
    await expect(page.locator("#time")).toContainText("s");

    // The panel, under what's shown: its tabs, one part at a time
    await page.getByRole("button", { name: "Inspect" }).click();
    await expect(page.locator("#panel")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Moves" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#moves").getByRole("button", { name: "forge", exact: true })).toBeVisible();
    await expect(page.locator("#details")).toBeHidden();
    await page.getByRole("tab", { name: "Details" }).click();
    await expect(page.locator("#details")).toBeVisible();
    await expect(page.locator("#moves")).toBeHidden();
    await page.getByRole("tab", { name: "Person" }).click();
    await expect(page.locator("#people")).toBeVisible();

    // (What's shown in the middle of what the bars and the panel leave of the view)
    const seen = await page.evaluate(() => ({ at: window.lab.onScreen(), ...window.lab.layout(), height: innerHeight }));

    expect(seen.covered.bottom).toBeGreaterThan(seen.height * 0.4);
    expect(seen.at[1]).toBeGreaterThan(seen.covered.top);
    expect(seen.at[1]).toBeLessThan(seen.height - seen.covered.bottom);

    // On its side: the panel beside what's shown, playing it and what it does one row
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.lab.layout().side);

    const turned = await page.evaluate(() => ({ panel: document.querySelector("#panel").getBoundingClientRect().left, transport: document.querySelector("#transport").getBoundingClientRect().top, bottom: document.querySelector("#bottom").getBoundingClientRect().top, at: window.lab.onScreen(), ...window.lab.layout() }));

    expect(turned.panel).toBeGreaterThan(400);
    expect(Math.abs(turned.transport - turned.bottom)).toBeLessThan(12);
    expect(turned.at[0]).toBeLessThan(turned.panel);

    // Shut with its own button
    await page.getByRole("button", { name: "Close the panel" }).click();
    await expect(page.locator("#panel")).toBeHidden();

    // (Something big, seen from far back on a narrow screen, not lost in the fog; and the view
    // beside a panel drawn its own shape, not stretched)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#picker").selectOption("dragon");

    const far = await page.evaluate(() => window.lab.camera());

    expect(far.fogFar).toBeGreaterThan(far.distance * 2);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Inspect" }).click();
    await page.waitForFunction(() => window.lab.camera().view);

    const beside = await page.evaluate(() => window.lab.camera());

    expect(Math.abs(beside.aspect - beside.view.fullWidth / beside.view.fullHeight)).toBeLessThan(1e-6);
});

test("and a hell's six flayed: each one of Monster1's builds, its twelve clips with its lunge (and its cast, one with a staff), its one simplified mesh, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);

    // (Its own, as their names sort, then those made from them: the lunge, and the cast)
    const BARE = ["Attack", "Attack 2", "Death", "Hit", "Hit 2", "Idle", "Idle 2", "Run", "Run Back", "Strafe Left", "Strafe Right", "Walk", "Lunge"];
    const STAFF = [...BARE, "Cast"];
    const SIX = [
        ["beast-flayling", "The Flayling", BARE, 8422, 58],
        ["beast-cinder-husk", "The Cinder Husk", BARE, 8712, 59],
        ["beast-pyre-acolyte", "The Pyre Acolyte", STAFF, 10575, 109],
        ["beast-ossuary-priest", "The Ossuary Priest", STAFF, 10709, 109],
        ["beast-dirge-warden", "The Dirge Warden", STAFF, 10637, 108],
        ["beast-flayed-hierarch", "The Flayed Hierarch", STAFF, 12099, 119],
    ];

    for (const [id, name, clips, triangles, bones] of SIX) {
        await openViewer(page, `/model-viewer.html?model=${id}&clip=Lunge`);
        await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
        expect(await page.evaluate(() => window.lab.watch().clips)).toEqual(clips);
        await page.waitForFunction(() => window.lab.watch().clip === "Lunge", null, { timeout: 60000 });
        await expect(page.locator("#name")).toHaveText(name);
        expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles, bones });
        await expect(page.locator("#details")).toContainText("Monster1, bought on Fab: used with the permission its Standard License gives");
    }
});


test("and a hell's six gorgers: each from one of Monster2's builds, its five clips with its bite, its spew and its roar, its one simplified mesh, and whose it is", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);

    // (Its own, as their names sort, then those made from its idle)
    const CLIPS = ["Attack", "Death", "Gethit", "Idle", "Walk", "Bite", "Spew", "Roar"];
    const SIX = [
        ["beast-slag-gorger", "The Slag Gorger", 7995],
        ["beast-forge-brute", "The Forge Brute", 10858],
        ["beast-chained-glutton", "The Chained Glutton", 13241],
        ["beast-bloat-gorger", "The Bloat Gorger", 7995],
        ["beast-pit-ravager", "The Pit Ravager", 10858],
        ["beast-gorger-warlord", "The Gorger Warlord", 13843],
    ];

    for (const [id, name, triangles] of SIX) {
        await openViewer(page, `/model-viewer.html?model=${id}&clip=Bite`);
        await expect(page.locator("#clips").getByRole("button", { name: /^Idle · / })).toBeVisible({ timeout: 60000 });
        expect(await page.evaluate(() => window.lab.watch().clips)).toEqual(CLIPS);
        await page.waitForFunction(() => window.lab.watch().clip === "Bite", null, { timeout: 60000 });
        await expect(page.locator("#name")).toHaveText(name);
        expect(await page.evaluate(() => window.lab.details())).toMatchObject({ meshes: 1, triangles });
        await expect(page.locator("#details")).toContainText("Monster2, bought on Fab: used with the permission its Standard License gives");
    }
});

// Each of a hell's own kinds (creatures.js) as the game draws it: a stand-in till its model's read,
// then its model, as tall as MODELS has it, its ways of attacking, its own special one and its
// rest ([kind, its attacks, a special of its own, its rest, how tall it's drawn])
async function drawnAsTheGame(page, kinds) {
    for (const [kind, attacks, special, rest, height] of kinds) {
        await openViewer(page, `/model-viewer.html?creature=${kind}`);
        await page.waitForFunction(() => window.lab.current().model, null, { timeout: 60000 });

        const current = await page.evaluate(() => window.lab.current());

        expect(current, kind).toMatchObject({ humanoid: false, attacks, rests: [rest] });

        if (special) {
            expect(current.specials, kind).toContain(special);
            expect(await page.evaluate(() => window.lab.watch().moves), kind).toContain(special);
        }

        expect(await page.evaluate(() => window.lab.avatar().character.height), kind).toBeCloseTo(height, 1);
    }
}

test("a hell's flayed as the game draws them: each its model, as tall as it's drawn, its claws or its staff, its lunge or what its free hand casts, curses, wails or drains, its other idle as it rests", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await drawnAsTheGame(page, [
        ["flayling", ["rake"], "lunge", "look", 1.85],
        ["cinderHusk", ["grasp", "lunge"], null, "look", 2],
        ["pyreAcolyte", ["sweep"], "cast", "look", 1.96],
        ["ossuaryPriest", ["sweep"], "curse", "look", 2.37],
        ["dirgeWarden", ["sweep"], "wail", "look", 2.61],
        ["flayedHierarch", ["sweep"], "drain", "look", 2.73],
    ]);
});

test("a hell's gorgers as the game draws them: each its model, as tall as it's drawn, its club or its claws, its maw's bite or spew, its roar as it rests", async ({ page }) => {
    test.skip(!licensedModelsHere(), LEFT_OUT);
    test.setTimeout(240000);
    await drawnAsTheGame(page, [
        ["slagGorger", ["claw"], "spew", "roar", 2.06],
        ["forgeBrute", ["smash"], "bite", "roar", 2.24],
        ["chainedGlutton", ["smash"], "bite", "roar", 2.47],
        ["bloatGorger", ["claw"], "spew", "roar", 2.15],
        ["pitRavager", ["rend"], "bite", "roar", 2.06],
        ["gorgerWarlord", ["smash"], "bite", "roar", 3.38],
    ]);
});
